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
import { axisBottom, axisLeft } from 'd3-axis';
import { scaleLinear, scaleUtc } from 'd3-scale';
import type React from 'react';
import { useRef, useState } from 'react';

import { useGlobalEventListener } from '../../hooks';
import { ceilDay, floorDay, formatBytes, formatInteger } from '../../utils';
import type { Margin, Stage } from '../../utils/stage';

import { ChartAxis } from './chart-axis';
import type { SegmentBar, SegmentStat } from './common';

import './segment-bar-chart-render.scss';

const CHART_MARGIN: Margin = { top: 40, right: 5, bottom: 20, left: 10 };

const COLORS = [
  '#b33040',
  '#d25c4d',
  '#f2b447',
  '#d9d574',
  '#4FAA7E',
  '#57ceff',
  '#789113',
  '#098777',
  '#b33040',
  '#d2757b',
  '#f29063',
  '#d9a241',
  '#80aa61',
  '#c4ff9e',
  '#915412',
  '#87606c',
];

interface SegmentBarChartRenderProps {
  stage: Stage;
  dateRange: NonNullDateRange;
  changeDateRange(newDateRange: NonNullDateRange): void;
  shownSegmentStat: SegmentStat;
  segmentBars: SegmentBar[];
  changeActiveDatasource(datasource: string | undefined): void;
}

export const SegmentBarChartRender = function SegmentBarChartRender(
  props: SegmentBarChartRenderProps,
) {
  const {
    stage,
    shownSegmentStat,
    dateRange,
    changeDateRange,
    segmentBars,
    changeActiveDatasource,
  } = props;
  const [hoverOn, setHoverOn] = useState<SegmentBar>();
  const [mouseDownAt, setMouseDownAt] = useState<Date | undefined>();
  const [dragging, setDragging] = useState<NonNullDateRange | undefined>();
  const svgRef = useRef<SVGSVGElement | null>(null);

  const innerStage = stage.applyMargin(CHART_MARGIN);

  const timeScale = scaleUtc().domain(dateRange).range([0, innerStage.width]);

  const maxStat = max(segmentBars, d => d[shownSegmentStat] + d.offset[shownSegmentStat]);
  const statScale = scaleLinear()
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

  function handleMouseDown(e: React.MouseEvent) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.x - CHART_MARGIN.left;
    setMouseDownAt(timeScale.invert(x));
  }

  useGlobalEventListener('mousemove', (e: MouseEvent) => {
    if (!mouseDownAt) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.x - CHART_MARGIN.left;
    const b = timeScale.invert(x);
    if (mouseDownAt < b) {
      setDragging([floorDay(mouseDownAt), ceilDay(b)]);
    } else {
      setDragging([floorDay(b), ceilDay(mouseDownAt)]);
    }
  });

  useGlobalEventListener('mouseup', () => {
    if (mouseDownAt) {
      setMouseDownAt(undefined);
    }
    if (dragging) {
      setDragging(undefined);
      changeDateRange(dragging);
    }
  });

  function segmentBarToRect(segmentBar: SegmentBar) {
    const xStart = timeScale(segmentBar.start);
    const xEnd = timeScale(segmentBar.end);
    const y0 = statScale(segmentBar.offset[shownSegmentStat]);
    const y = statScale(segmentBar[shownSegmentStat] + segmentBar.offset[shownSegmentStat]);

    return {
      x: xStart,
      y: y,
      width: Math.max(xEnd - xStart, 1),
      height: Math.abs(y0 - y),
    };
  }

  return (
    <div className="segment-bar-chart-render">
      {dragging ? (
        <div className="bar-chart-tooltip">
          <div>Start: {dragging[0].toISOString()}</div>
          <div>End: {dragging[1].toISOString()}</div>
        </div>
      ) : hoverOn ? (
        <div className="bar-chart-tooltip">
          <div>Datasource: {hoverOn.datasource}</div>
          <div>Time: {hoverOn.start.toISOString()}</div>
          <div>
            {`${shownSegmentStat === 'count' ? 'Count' : 'Size'}: ${formatTick(
              hoverOn[shownSegmentStat] * hoverOn.durationSeconds,
            )}`}
          </div>
        </div>
      ) : undefined}
      <svg
        ref={svgRef}
        width={stage.width}
        height={stage.height}
        viewBox={`0 0 ${stage.width} ${stage.height}`}
        preserveAspectRatio="xMinYMin meet"
        onMouseDown={handleMouseDown}
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
          <g className="bar-group">
            {segmentBars.map((segmentBar, i) => {
              return (
                <rect
                  key={i}
                  className="bar-unit"
                  {...segmentBarToRect(segmentBar)}
                  style={{ fill: COLORS[i % COLORS.length] }}
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
            {(dragging || mouseDownAt) && (
              <rect
                className="selection"
                x={timeScale(dragging?.[0] || mouseDownAt!)}
                y={0}
                height={innerStage.height}
                width={dragging ? timeScale(dragging[1]) - timeScale(dragging[0]) : 1}
              />
            )}
          </g>
        </g>
      </svg>
    </div>
  );
};
