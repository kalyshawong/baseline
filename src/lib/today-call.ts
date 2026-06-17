/**
 * @deprecated Superseded by `computeTrainingCall` in `./training` and
 * `getTrainingCallForDate` in `./training-call`. This file's logic only
 * looked at baselineScore + cycle phase + stress; the integrated call
 * also factors in HRV CV (Flatt & Esco overreaching) and the Pritchard
 * fatigue score so the dashboard never contradicts /body.
 *
 * Safe to delete this file once you've confirmed nothing imports from it.
 */

export {};
