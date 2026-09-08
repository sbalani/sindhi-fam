import test from "node:test";
import assert from "node:assert/strict";
import { locationPoint } from "./locationUtils.js";

test("reads current structured location coordinates", () => {
  assert.deepEqual(locationPoint({ latitude: 24.86, longitude: 67.01 }), {
    latitude: 24.86,
    longitude: 67.01,
  });
});

test("reads proposed legacy coordinate aliases", () => {
  assert.deepEqual(locationPoint({ lat: 27.71, lon: 68.85 }), {
    latitude: 27.71,
    longitude: 68.85,
  });
});

test("preserves valid zero coordinates and rejects missing coordinates", () => {
  assert.deepEqual(locationPoint({ latitude: 0, longitude: 0 }), {
    latitude: 0,
    longitude: 0,
  });
  assert.equal(locationPoint({ latitude: 24.86 }), null);
});
