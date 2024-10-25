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
import { max } from 'd3-array';
import type { AxisScale } from 'd3-axis';
import { axisBottom, axisLeft } from 'd3-axis';
import { scaleLinear, scaleUtc } from 'd3-scale';
import { useState } from 'react';

import { formatBytes, formatInteger } from '../../utils';
import type { Margin, Stage } from '../../utils/stage';

import { ChartAxis } from './chart-axis';
import type { SegmentBar, SegmentStat } from './common';

import './segment-bar-chart-render.scss';

const CHART_MARGIN: Margin = { top: 40, right: 5, bottom: 20, left: 60 };

interface SegmentBarChartRenderProps {
  stage: Stage;
  dateRange: NonNullDateRange;
  shownSegmentStat: SegmentStat;
  segmentBars: SegmentBar[];
  changeActiveDatasource(datasource: string | undefined): void;
}

export const SegmentBarChartRender = function SegmentBarChartRender(
  props: SegmentBarChartRenderProps,
) {
  const { stage, shownSegmentStat, dateRange, segmentBars, changeActiveDatasource } = props;
  const [hoverOn, setHoverOn] = useState<SegmentBar>();

  const innerStage = stage.applyMargin(CHART_MARGIN);

  const timeScale: AxisScale<Date> = scaleUtc().domain(dateRange).range([0, innerStage.width]);

  const maxStat = max(segmentBars, d => d[shownSegmentStat]);
  const statScale: AxisScale<number> = scaleLinear()
    .rangeRound([innerStage.height, 0])
    .domain([0, maxStat ?? 1]);

  const formatTick = (n: number) => {
    if (isNaN(n)) return '';
    if (shownSegmentStat === 'count') {
      return formatInteger(n);
    } else {
      return formatBytes(n);
    }
  };

  function segmentBarToRect(segmentBar: SegmentBar) {
    const y0 = statScale(0)!; // segmentBar.y0 ||
    const xStart = timeScale(segmentBar.startDate)!;
    const xEnd = timeScale(segmentBar.endDate)!;
    const y = statScale(segmentBar[shownSegmentStat]) || 0;

    return {
      x: xStart,
      y: y,
      width: Math.max(xEnd - xStart, 1),
      height: Math.abs(y0 - y),
    };
  }

  return (
    <div className="segment-bar-chart-render">
      {hoverOn && (
        <div className="bar-chart-tooltip">
          <div>Datasource: {hoverOn.datasource}</div>
          <div>Time: {hoverOn.start}</div>
          <div>
            {`${shownSegmentStat === 'count' ? 'Count' : 'Size'}: ${formatTick(
              hoverOn[shownSegmentStat],
            )}`}
          </div>
        </div>
      )}
      <svg
        width={stage.width}
        height={stage.height}
        viewBox={`0 0 ${stage.width} ${stage.height}`}
        preserveAspectRatio="xMinYMin meet"
      >
        <g
          transform={`translate(${CHART_MARGIN.left},${CHART_MARGIN.top})`}
          onMouseLeave={() => setHoverOn(undefined)}
        >
          <ChartAxis
            className="gridline-x"
            transform="translate(0,0)"
            axis={axisLeft(statScale)
              .ticks(5)
              .tickSize(-innerStage.width)
              .tickFormat(() => '')
              .tickSizeOuter(0)}
          />
          <ChartAxis
            className="axis-x"
            transform={`translate(0,${innerStage.height})`}
            axis={axisBottom(timeScale)}
          />
          <ChartAxis
            className="axis-y"
            axis={axisLeft(statScale)
              .ticks(5)
              .tickFormat(e => formatTick(e))}
          />
          {segmentBars.map((segmentBar, i) => {
            return (
              <rect
                key={i}
                className="bar-unit"
                {...segmentBarToRect(segmentBar)}
                style={{ fill: i % 2 ? 'red' : 'blue' }}
                onClick={
                  segmentBar.datasource
                    ? () => changeActiveDatasource(segmentBar.datasource)
                    : undefined
                }
                onMouseOver={() => setHoverOn(segmentBar)}
              />
            );
          })}
          {hoverOn && (
            <rect
              className="hovered-bar"
              {...segmentBarToRect(hoverOn)}
              onClick={() => {
                setHoverOn(undefined);
                changeActiveDatasource(hoverOn.datasource);
              }}
            />
          )}
        </g>
      </svg>
    </div>
  );
};
