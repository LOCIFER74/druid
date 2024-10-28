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
import classNames from 'classnames';
import { max } from 'd3-array';
import { axisBottom, axisLeft } from 'd3-axis';
import { scaleLinear, scaleOrdinal, scaleUtc } from 'd3-scale';
import type React from 'react';
import { useMemo, useRef, useState } from 'react';

import { useGlobalEventListener } from '../../hooks';
import {
  capitalizeFirst,
  ceilDay,
  clamp,
  floorDay,
  formatByteRate,
  formatBytes,
  formatInteger,
  formatNumber,
} from '../../utils';
import type { Margin, Stage } from '../../utils/stage';

import { ChartAxis } from './chart-axis';
import type { SegmentBar, SegmentStat } from './common';

import './segment-bar-chart-render.scss';

const CHART_MARGIN: Margin = { top: 40, right: 5, bottom: 20, left: 80 };

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

function offsetDateRange(dateRange: NonNullDateRange, offset: number): NonNullDateRange {
  return [new Date(dateRange[0].valueOf() + offset), new Date(dateRange[1].valueOf() + offset)];
}

interface SegmentBarChartRenderProps {
  stage: Stage;
  dateRange: NonNullDateRange;
  changeDateRange(dateRange: NonNullDateRange): void;
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
  const [mouseDownAt, setMouseDownAt] = useState<
    { time: Date; action: 'select' | 'shift' } | undefined
  >();
  const [dragging, setDragging] = useState<NonNullDateRange | undefined>();
  const [shiftOffset, setShiftOffset] = useState<number | undefined>();
  const svgRef = useRef<SVGSVGElement | null>(null);

  const innerStage = stage.applyMargin(CHART_MARGIN);

  const baseTimeScale = scaleUtc().domain(dateRange).range([0, innerStage.width]);

  const timeScale = shiftOffset
    ? baseTimeScale.copy().domain(offsetDateRange(dateRange, shiftOffset))
    : baseTimeScale;

  const colorizer = useMemo(() => {
    const s = scaleOrdinal().range(COLORS);
    return (d: SegmentBar) => (d.datasource ? s(d.datasource) : COLORS[0]) as string;
  }, []);

  const maxStat = max(segmentBars, d => d[shownSegmentStat] + d.offset[shownSegmentStat]);
  const statScale = scaleLinear()
    .rangeRound([innerStage.height, 0])
    .domain([0, maxStat ?? 1]);

  const formatTick = (n: number) => {
    switch (shownSegmentStat) {
      case 'count':
      case 'rows':
        return formatInteger(n);

      case 'size':
        return formatBytes(n);
    }
  };

  const formatTickRate = (n: number) => {
    switch (shownSegmentStat) {
      case 'count':
        return formatNumber(n) + ' seg/s';

      case 'rows':
        return formatNumber(n) + ' row/s';

      case 'size':
        return formatByteRate(n);
    }
  };

  function handleMouseDown(e: React.MouseEvent) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.x - CHART_MARGIN.left;
    const y = e.clientY - rect.y - CHART_MARGIN.top;
    setMouseDownAt({
      time: baseTimeScale.invert(x),
      action: y > innerStage.height ? 'shift' : 'select',
    });
  }

  useGlobalEventListener('mousemove', (e: MouseEvent) => {
    if (!mouseDownAt) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.x - CHART_MARGIN.left;
    const b = baseTimeScale.invert(x);
    if (mouseDownAt.action === 'shift' || e.shiftKey) {
      setShiftOffset(mouseDownAt.time.valueOf() - b.valueOf());
    } else {
      if (mouseDownAt.time < b) {
        setDragging([floorDay(mouseDownAt.time), ceilDay(b)]);
      } else {
        setDragging([floorDay(b), ceilDay(mouseDownAt.time)]);
      }
    }
  });

  useGlobalEventListener('mouseup', (e: MouseEvent) => {
    if (!mouseDownAt) return;
    setMouseDownAt(undefined);

    if (!shiftOffset && !dragging) return;
    setDragging(undefined);
    setShiftOffset(undefined);
    if (mouseDownAt.action === 'shift' || e.shiftKey) {
      if (shiftOffset) {
        changeDateRange(offsetDateRange(dateRange, shiftOffset));
      }
    } else {
      if (dragging) {
        changeDateRange(dragging);
      }
    }
  });

  function segmentBarToRect(segmentBar: SegmentBar) {
    const xStart = clamp(timeScale(segmentBar.start), 0, innerStage.width);
    const xEnd = clamp(timeScale(segmentBar.end), 0, innerStage.width);
    const y0 = statScale(segmentBar.offset[shownSegmentStat]);
    const y = statScale(segmentBar[shownSegmentStat] + segmentBar.offset[shownSegmentStat]);

    return {
      x: xStart,
      y: y,
      width: Math.max(xEnd - xStart - 1, 1),
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
            {`${capitalizeFirst(shownSegmentStat)}: ${formatTick(
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
          <rect
            className={classNames('time-shift-indicator', {
              shifting: typeof shiftOffset === 'number',
            })}
            x={0}
            y={innerStage.height}
            width={innerStage.width}
            height={CHART_MARGIN.bottom}
          />
          <ChartAxis
            className="axis-y"
            axis={axisLeft(statScale)
              .ticks(5)
              .tickFormat(e => formatTickRate(e.valueOf()))}
          />
          <g className="bar-group">
            {segmentBars.map((segmentBar, i) => {
              return (
                <rect
                  key={i}
                  className="bar-unit"
                  {...segmentBarToRect(segmentBar)}
                  style={{ fill: colorizer(segmentBar) }}
                  onClick={
                    segmentBar.datasource
                      ? () => changeActiveDatasource(segmentBar.datasource)
                      : undefined
                  }
                  onMouseOver={() => {
                    if (mouseDownAt) return;
                    setHoverOn(segmentBar);
                  }}
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
            {dragging && (
              <rect
                className="selection"
                x={timeScale(dragging[0])}
                y={0}
                height={innerStage.height}
                width={timeScale(dragging[1]) - timeScale(dragging[0])}
              />
            )}
            {!!shiftOffset && (
              <rect
                className="shifter"
                x={timeScale(shiftOffset > 0 ? dateRange[1] : dateRange[0].valueOf() + shiftOffset)}
                y={0}
                height={innerStage.height}
                width={Math.abs(
                  timeScale(dateRange[0]) - timeScale(dateRange[0].valueOf() + shiftOffset),
                )}
              />
            )}
          </g>
        </g>
      </svg>
    </div>
  );
};
