import { useCallback, useEffect, useRef, useState } from "react";
import MovingAverage from "moving-average";

const MIN_VOLUME_THRESHOLD = 0.08;

const calculateVolume = (analyser, levels) => {
  // take care with compatibility, e.g. safari doesn't support getFloatTimeDomainData
  analyser.getByteTimeDomainData(levels);
  let sum = 0;
  for (let i = 0; i < levels.length; i++) {
    const amplitude = (levels[i] - 128) / 128;
    sum += amplitude * amplitude;
  }
  const currVolume = Math.sqrt(sum / levels.length);
  return currVolume;
};

function updateVolume(analyser, meter) {
  const newRawVolume = calculateVolume(analyser, meter.levels);

  const newPerceivedVolume = Math.log(THREE.Math.mapLinear(newRawVolume, 0, 1, 1, Math.E));

  meter.volume = newPerceivedVolume < MIN_VOLUME_THRESHOLD ? 0 : newPerceivedVolume;

  const s = meter.volume > meter.prevVolume ? 0.35 : 0.3;
  meter.volume = s * meter.volume + (1 - s) * meter.prevVolume;
  meter.prevVolume = meter.volume;
}

export function useVolumeMeter({ analyser, updateRate = 50 }) {
  const movingAvgRef = useRef();
  const meterRef = useRef({ levels: [], volume: 0, prevVolume: 0, max: 0 });
  const [volume, setVolume] = useState(0);
  const nodeRef = useRef();

  useEffect(
    () => {
      if (!movingAvgRef.current) {
        movingAvgRef.current = MovingAverage(updateRate * 2);
      }

      analyser.fftSize = 32;
      meterRef.current.levels = new Uint8Array(analyser.fftSize);

      const timout = setInterval(() => {
        updateVolume(analyser, meterRef.current);

        meterRef.current.max = Math.max(meterRef.current.volume, meterRef.current.max);

        // We use a moving average to smooth out the visual animation or else it would twitch too fast for
        // the css renderer to keep up.
        movingAvgRef.current.push(Date.now(), meterRef.current.volume);
        const average = movingAvgRef.current.movingAverage();
        const nextVolume = meterRef.current.max === 0 ? 0 : average / meterRef.current.max;

        setVolume(prevVolume => (Math.abs(prevVolume - nextVolume) > 0.05 ? nextVolume : prevVolume));
      }, updateRate);

      return () => {
        nodeRef.current?.disconnect();
        clearInterval(timout);
      };
    },
    [nodeRef, analyser, updateRate]
  );

  const setAudioSource = useCallback(
    source => {
      if (source) {
        nodeRef.current?.disconnect();
        nodeRef.current = source;
        if (nodeRef.current) {
          nodeRef.current.connect(analyser);
        }
      } else {
        nodeRef.current?.disconnect();
      }
    },
    [nodeRef, analyser]
  );

  return { volume, setAudioSource };
}
