// Records snapshots of the simulation so the drive can be scrubbed back through time.
export function createRecorder(maxFrames = 5400) {
  const frames = []
  return {
    record(state) {
      frames.push(structuredClone(state))
      if (frames.length > maxFrames) frames.shift()
    },
    get length() {
      return frames.length
    },
    at(i) {
      return frames[Math.max(0, Math.min(i, frames.length - 1))]
    },
    last() {
      return frames[frames.length - 1]
    },
    // Go back to frame i: drop everything after it and return a copy to continue from.
    rewindTo(i) {
      const index = Math.max(0, Math.min(i, frames.length - 1))
      const copy = structuredClone(frames[index])
      frames.length = index + 1
      return copy
    },
    clear() {
      frames.length = 0
    },
  }
}