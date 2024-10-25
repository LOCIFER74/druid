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

import { Button, FormGroup, MenuItem, ResizeSensor, SegmentedControl } from '@blueprintjs/core';
import type { NonNullDateRange } from '@blueprintjs/datetime';
import { DateRangeInput3 } from '@blueprintjs/datetime2';
import { IconNames } from '@blueprintjs/icons';
import { Select } from '@blueprintjs/select';
import enUS from 'date-fns/locale/en-US';
import type React from 'react';
import { useState } from 'react';

import type { Capabilities } from '../../helpers';
import {
  ceilToUtcDay,
  isNonNullRange,
  localToUtcDateRange,
  utcToLocalDateRange,
} from '../../utils';
import { Stage } from '../../utils/stage';
import { SplitterLayout } from '../splitter-layout/splitter-layout';

import type { SegmentStat } from './common';
import { SegmentBarChart } from './segment-bar-chart';

import './segment-timeline.scss';

interface SegmentTimelineProps {
  capabilities: Capabilities;
}

const DEFAULT_TIME_SPAN_MONTHS = 3;

function getDefaultDateRange(): NonNullDateRange {
  const start = ceilToUtcDay(new Date());
  const end = new Date(start.valueOf());
  start.setUTCMonth(start.getUTCMonth() - DEFAULT_TIME_SPAN_MONTHS);
  return [start, end];
}

export const SegmentTimeline = function SegmentTimeline(props: SegmentTimelineProps) {
  const { capabilities } = props;
  const [stage, setStage] = useState<Stage | undefined>();
  const [activeSegmentStat, setActiveSegmentStat] = useState<SegmentStat>('size');
  const [activeDatasource, setActiveDatasource] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<NonNullDateRange>(getDefaultDateRange);

  const datasources: string[] = ['wiki', 'kttm'];

  const DatasourceSelect: React.FC = () => {
    const showAll = 'Show all';
    const datasourcesWzAll = [showAll].concat(datasources);
    return (
      <Select<string>
        items={datasourcesWzAll}
        onItemSelect={(selectedItem: string) => {
          setActiveDatasource(selectedItem === showAll ? undefined : selectedItem);
        }}
        itemRenderer={(val, { handleClick, handleFocus, modifiers }) => {
          if (!modifiers.matchesPredicate) return null;
          return (
            <MenuItem
              key={val}
              disabled={modifiers.disabled}
              active={modifiers.active}
              onClick={handleClick}
              onFocus={handleFocus}
              roleStructure="listoption"
              text={val}
            />
          );
        }}
        noResults={<MenuItem disabled text="No results" roleStructure="listoption" />}
        itemPredicate={(query, val, _index, exactMatch) => {
          const normalizedTitle = val.toLowerCase();
          const normalizedQuery = query.toLowerCase();

          if (exactMatch) {
            return normalizedTitle === normalizedQuery;
          } else {
            return normalizedTitle.includes(normalizedQuery);
          }
        }}
        fill
      >
        <Button
          text={activeDatasource === null ? showAll : activeDatasource}
          fill
          rightIcon={IconNames.CARET_DOWN}
        />
      </Select>
    );
  };

  return (
    <SplitterLayout
      className="segment-timeline"
      primaryMinSize={400}
      secondaryInitialSize={220}
      secondaryMaxSize={400}
    >
      <ResizeSensor
        onResize={(entries: ResizeObserverEntry[]) => {
          const rect = entries[0].contentRect;
          setStage(new Stage(rect.width, rect.height));
        }}
      >
        <div className="chart-container">
          {stage && (
            <SegmentBarChart
              capabilities={capabilities}
              stage={stage}
              dateRange={dateRange}
              shownSegmentStat={activeSegmentStat}
              breakByDataSource={false}
              changeActiveDatasource={(datasource: string | undefined) =>
                setActiveDatasource(activeDatasource ? undefined : datasource)
              }
            />
          )}
        </div>
      </ResizeSensor>
      <div className="side-control">
        <FormGroup label="Show">
          <SegmentedControl
            value={activeSegmentStat}
            onValueChange={s => setActiveSegmentStat(s as SegmentStat)}
            fill
            options={[
              {
                label: 'Size',
                value: 'size',
              },
              {
                label: 'Count',
                value: 'count',
              },
            ]}
          />
        </FormGroup>
        <FormGroup label="Interval">
          <DateRangeInput3
            value={utcToLocalDateRange(dateRange)}
            onChange={newDateRange => {
              const newUtcDateRange = localToUtcDateRange(newDateRange);
              if (!isNonNullRange(newUtcDateRange)) return;
              setDateRange(newUtcDateRange);
            }}
            fill
            locale={enUS}
          />
        </FormGroup>
        <FormGroup label="Datasource">
          <DatasourceSelect />
        </FormGroup>
      </div>
    </SplitterLayout>
  );
};
