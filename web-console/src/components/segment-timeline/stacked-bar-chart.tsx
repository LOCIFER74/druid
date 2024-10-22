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

import type { AxisScale } from 'd3-axis';
import { axisBottom, axisLeft } from 'd3-axis';
import React, { useState } from 'react';

import { formatBytes, formatInteger } from '../../utils';

import { BarGroup } from './bar-group';
import { ChartAxis } from './chart-axis';
import type { BarUnitData, HoveredBarInfo, Margin, SegmentStat } from './common';

import './stacked-bar-chart.scss';

interface StackedBarChartProps {
  svgWidth: number;
  svgHeight: number;
  margin: Margin;
  shownSegmentStat: SegmentStat;
  dataToRender: BarUnitData[];
  changeActiveDatasource: (e: string | undefined) => void;
  xScale: AxisScale<Date>;
  yScale: AxisScale<number>;
  barWidth: number;
}

export const StackedBarChart = React.forwardRef(function StackedBarChart(
  props: StackedBarChartProps,
  ref,
) {
  const {
    shownSegmentStat,
    svgWidth,
    svgHeight,
    margin,
    xScale,
    yScale,
    dataToRender,
    changeActiveDatasource,
    barWidth,
  } = props;
  const [hoverOn, setHoverOn] = useState<HoveredBarInfo>();

  const formatTick = (n: number) => {
    if (isNaN(n)) return '';
    if (shownSegmentStat === 'countData') {
      return formatInteger(n);
    } else {
      return formatBytes(n);
    }
  };

  const width = svgWidth - margin.left - margin.right;
  const height = svgHeight - margin.top - margin.bottom;

  return (
    <div className="stacked-bar-chart" ref={ref as any}>
      {hoverOn && (
        <div className="bar-chart-tooltip">
          <div>Datasource: {hoverOn.datasource}</div>
          <div>Time: {hoverOn.xValue}</div>
          <div>
            {`${
              shownSegmentStat === 'countData' ? 'Daily total count:' : 'Daily total size:'
            } ${formatTick(hoverOn.dailySize)}`}
          </div>
          <div>
            {`${shownSegmentStat === 'countData' ? 'Count:' : 'Size:'} ${formatTick(
              hoverOn.yValue,
            )}`}
          </div>
        </div>
      )}
      <svg
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        preserveAspectRatio="xMinYMin meet"
      >
        <g
          transform={`translate(${margin.left}, ${margin.top})`}
          onMouseLeave={() => setHoverOn(undefined)}
        >
          <ChartAxis
            className="gridline-x"
            transform="translate(0, 0)"
            axis={axisLeft(yScale)
              .ticks(5)
              .tickSize(-width)
              .tickFormat(() => '')
              .tickSizeOuter(0)}
          />
          <BarGroup
            dataToRender={dataToRender}
            changeActiveDatasource={changeActiveDatasource}
            xScale={xScale}
            yScale={yScale}
            onHoverBar={(e: HoveredBarInfo) => setHoverOn(e)}
            barWidth={barWidth}
          />
          <ChartAxis
            className="axis-x"
            transform={`translate(0, ${height})`}
            axis={axisBottom(xScale)}
          />
          <ChartAxis
            className="axis-y"
            axis={axisLeft(yScale)
              .ticks(5)
              .tickFormat(e => formatTick(e))}
          />
          {hoverOn && (
            <g
              className="hovered-bar"
              onClick={() => {
                setHoverOn(undefined);
                changeActiveDatasource(hoverOn.datasource);
              }}
            >
              <rect
                x={hoverOn.xCoordinate}
                y={hoverOn.yCoordinate}
                width={barWidth}
                height={hoverOn.height}
              />
            </g>
          )}
        </g>
      </svg>
    </div>
  );
});
