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

import { sum } from 'd3-array';

export type SegmentStat = 'count' | 'size' | 'rows';

export function aggregateSegmentStats(
  xs: readonly Record<SegmentStat, number>[],
): Record<SegmentStat, number> {
  return {
    count: sum(xs, s => s.count),
    size: sum(xs, s => s.size),
    rows: sum(xs, s => s.rows),
  };
}

export interface SegmentRow extends Record<SegmentStat, number> {
  start: Date;
  end: Date;
  durationSeconds: number;
  datasource?: string;
}

export interface SegmentBar extends SegmentRow {
  offset: Record<SegmentStat, number>;
}

export function normalizedSegmentRow(sr: SegmentRow): SegmentRow {
  return {
    ...sr,
    count: sr.count / sr.durationSeconds,
    size: sr.size / sr.durationSeconds,
    rows: sr.rows / sr.durationSeconds,
  };
}
