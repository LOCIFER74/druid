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
import { sum } from 'd3-array';
import { useMemo } from 'react';

import type { Capabilities } from '../../helpers';
import { useQueryManager } from '../../hooks';
import { Api } from '../../singletons';
import { filterMap, groupBy, queryDruidSql } from '../../utils';
import type { Stage } from '../../utils/stage';
import { Loader } from '../loader/loader';

import type { SegmentBar, SegmentRow, SegmentStat } from './common';
import { SegmentBarChartRender } from './segment-bar-chart-render';

import './segment-bar-chart.scss';

type TrimDuration = 'PT1H' | 'P1D' | 'P1M' | 'P1Y';

function trimUtcDate(date: string, duration: TrimDuration): string {
  // date like 2024-09-26T00:00:00.000Z
  switch (duration) {
    case 'PT1H':
      return date.substring(0, 13) + ':00:00Z';

    case 'P1D':
      return date.substring(0, 10) + 'T00:00:00Z';

    case 'P1M':
      return date.substring(0, 7) + '-01T00:00:00Z';

    case 'P1Y':
      return date.substring(0, 4) + '-01-01T00:00:00Z';

    default:
      throw new Error(`Unexpected duration: ${duration}`);
  }
}

interface SegmentBarChartProps {
  capabilities: Capabilities;
  stage: Stage;
  dateRange: NonNullDateRange;
  breakByDataSource: boolean;
  shownSegmentStat: SegmentStat;
  changeActiveDatasource: (datasource: string | undefined) => void;
}

export const SegmentBarChart = function SegmentBarChart(props: SegmentBarChartProps) {
  const {
    capabilities,
    dateRange,
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

        segmentRows = await queryDruidSql({ query: query.toString() });
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
                const [start, end] = interval.split('/');
                const { count, size, rows } = v as any;
                return {
                  start,
                  end,
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

      const trimDuration: TrimDuration = 'P1D';
      return groupBy(
        segmentRows,
        segmentRow =>
          // This trimming should ideally be pushed into the SQL query but at the time of this writing queries on the sys.* tables do not allow substring
          `${trimUtcDate(segmentRow.start, trimDuration)}/${trimUtcDate(
            segmentRow.end,
            trimDuration,
          )}/${segmentRow.datasource || ''}`,
        (segmentRows): SegmentBar => {
          const firstRow = segmentRows[0];
          const start = trimUtcDate(firstRow.start, trimDuration);
          const end = trimUtcDate(firstRow.end, trimDuration);
          return {
            ...firstRow,
            start,
            startDate: new Date(start),
            end,
            endDate: new Date(end),
            count: sum(segmentRows, s => s.count),
            size: sum(segmentRows, s => s.size),
            rows: sum(segmentRows, s => s.rows),
          };
        },
      );
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

  console.log(segmentRows);
  return (
    <SegmentBarChartRender
      stage={stage}
      dateRange={dateRange}
      shownSegmentStat={shownSegmentStat}
      segmentBars={segmentRows}
      changeActiveDatasource={changeActiveDatasource}
    />
  );
};
