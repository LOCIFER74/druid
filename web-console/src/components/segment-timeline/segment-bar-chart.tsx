/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { NonNullDateRange } from '@blueprintjs/datetime';
import { C, F, N, sql, SqlQuery } from '@druid-toolkit/query';
import IntervalTree from '@flatten-js/interval-tree';
import { useMemo } from 'react';

import type { Capabilities } from '../../helpers';
import { useQueryManager } from '../../hooks';
import { Api } from '../../singletons';
import {
  ceilDay,
  ceilHour,
  ceilMonth,
  ceilYear,
  filterMap,
  floorDay,
  floorHour,
  floorMonth,
  floorYear,
  groupBy,
  queryDruidSql,
} from '../../utils';
import type { Stage } from '../../utils/stage';
import { Loader } from '../loader/loader';

import type { SegmentBar, SegmentRow, SegmentStat } from './common';
import { aggregateSegmentStats, normalizedSegmentRow } from './common';
import { SegmentBarChartRender } from './segment-bar-chart-render';

import './segment-bar-chart.scss';

type TrimDuration = 'PT1H' | 'P1D' | 'P1M' | 'P1Y';

function floorToDuration(date: Date, duration: TrimDuration): Date {
  switch (duration) {
    case 'PT1H':
      return floorHour(date);

    case 'P1D':
      return floorDay(date);

    case 'P1M':
      return floorMonth(date);

    case 'P1Y':
      return floorYear(date);

    default:
      throw new Error(`Unexpected duration: ${duration}`);
  }
}

function ceilToDuration(date: Date, duration: TrimDuration): Date {
  switch (duration) {
    case 'PT1H':
      return ceilHour(date);

    case 'P1D':
      return ceilDay(date);

    case 'P1M':
      return ceilMonth(date);

    case 'P1Y':
      return ceilYear(date);

    default:
      throw new Error(`Unexpected duration: ${duration}`);
  }
}

function stackSegmentRows(segmentRows: SegmentRow[]): SegmentBar[] {
  const sorted = segmentRows.sort((a, b) => {
    const diff = b.durationSeconds - a.durationSeconds;
    if (diff) return diff;
    if (!a.datasource || !b.datasource) return 0;
    return b.datasource.localeCompare(a.datasource);
  });

  const intervalTree = new IntervalTree();
  return sorted.map(segmentRow => {
    segmentRow = normalizedSegmentRow(segmentRow);
    const startMs = segmentRow.start.valueOf();
    const endMs = segmentRow.end.valueOf();
    const segmentRowsBelow = intervalTree.search([startMs + 1, startMs + 2]) as SegmentRow[];
    intervalTree.insert([startMs, endMs], segmentRow);
    return {
      ...segmentRow,
      offset: aggregateSegmentStats(segmentRowsBelow),
    };
  });
}

interface SegmentBarChartProps {
  capabilities: Capabilities;
  stage: Stage;
  dateRange: NonNullDateRange;
  changeDateRange(newDateRange: NonNullDateRange): void;
  breakByDataSource: boolean;
  shownSegmentStat: SegmentStat;
  changeActiveDatasource: (datasource: string | undefined) => void;
}

export const SegmentBarChart = function SegmentBarChart(props: SegmentBarChartProps) {
  const {
    capabilities,
    dateRange,
    changeDateRange,
    breakByDataSource,
    stage,
    shownSegmentStat,
    changeActiveDatasource,
  } = props;

  const intervalsQuery = useMemo(
    () => ({ capabilities, dateRange, breakByDataSource }),
    [capabilities, dateRange, breakByDataSource],
  );

  const [segmentRowsState] = useQueryManager({
    query: intervalsQuery,
    processQuery: async ({ capabilities, dateRange, breakByDataSource }, cancelToken) => {
      const trimDuration: TrimDuration = 'PT1H';
      let segmentRows: SegmentRow[];
      if (capabilities.hasSql()) {
        const query = SqlQuery.from(N('sys').table('segments'))
          .changeWhereExpression(
            sql`'${dateRange[0].toISOString()}' <= "start" AND "end" <= '${dateRange[1].toISOString()}' AND is_published = 1 AND is_overshadowed = 0`,
          )
          .addSelect(C('start'), { addToGroupBy: 'end' })
          .addSelect(C('end'), { addToGroupBy: 'end' })
          .applyIf(breakByDataSource, q => q.addSelect(C('datasource'), { addToGroupBy: 'end' }))
          .addSelect(F.count().as('count'))
          .addSelect(F.sum(C('size')).as('size'))
          .addSelect(F.sum(C('num_rows')).as('rows'));

        segmentRows = (await queryDruidSql({ query: query.toString() })).map(sr => {
          const start = floorToDuration(new Date(sr.start), trimDuration);
          const end = ceilToDuration(new Date(sr.end), trimDuration);
          return {
            ...sr,
            start,
            end,
            durationSeconds: (end.valueOf() - start.valueOf()) / 1000,
          };
        }); // This trimming should ideally be pushed into the SQL query but at the time of this writing queries on the sys.* tables do not allow substring
      } else {
        const datasources: string[] = (
          await Api.instance.get(`/druid/coordinator/v1/datasources`, { cancelToken })
        ).data;
        segmentRows = (
          await Promise.all(
            datasources.map(async datasource => {
              const intervalMap = (
                await Api.instance.get(
                  `/druid/coordinator/v1/datasources/${Api.encodePath(
                    datasource,
                  )}/intervals?simple`,
                  { cancelToken },
                )
              ).data;

              return filterMap(Object.entries(intervalMap), ([interval, v]) => {
                // ToDo: Filter on start end
                const [startStr, endStr] = interval.split('/');
                const start = floorToDuration(new Date(startStr), trimDuration);
                const end = ceilToDuration(new Date(endStr), trimDuration);
                const { count, size, rows } = v as any;
                return {
                  start,
                  end,
                  durationSeconds: (end.valueOf() - start.valueOf()) / 1000,
                  datasource: breakByDataSource ? datasource : undefined,
                  count,
                  size,
                  rows,
                };
              });
            }),
          )
        ).flat();
      }

      const fullyGroupedSegmentRows = groupBy(
        segmentRows,
        segmentRow =>
          [
            segmentRow.start.toISOString(),
            segmentRow.end.toISOString(),
            segmentRow.datasource || '',
          ].join('/'),
        (segmentRows): SegmentRow => {
          return {
            ...segmentRows[0],
            ...aggregateSegmentStats(segmentRows),
          };
        },
      );

      return stackSegmentRows(fullyGroupedSegmentRows);
    },
  });

  if (segmentRowsState.loading) {
    return <Loader />;
  }

  if (segmentRowsState.error) {
    return (
      <div className="empty-placeholder">
        <span className="no-data-text">{`Error when loading data: ${segmentRowsState.getErrorMessage()}`}</span>
      </div>
    );
  }

  const segmentRows = segmentRowsState.data;
  if (!segmentRows) return null;

  if (!segmentRows.length) {
    return (
      <div className="empty-placeholder">
        <span className="no-data-text">There are no segments for the selected interval</span>
      </div>
    );
  }

  return (
    <SegmentBarChartRender
      stage={stage}
      dateRange={dateRange}
      changeDateRange={changeDateRange}
      shownSegmentStat={shownSegmentStat}
      segmentBars={segmentRows as any}
      changeActiveDatasource={changeActiveDatasource}
    />
  );
};
