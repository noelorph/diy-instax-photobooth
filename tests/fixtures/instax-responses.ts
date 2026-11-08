// Recorded payload excerpts from the November 6 FI033/0102 trials; no image data.
export const instaxStatus = (hex = '00022900000b00000000') => ({
  opcode: 2,
  payload: Uint8Array.from(hex.match(/../g)!, (byte) => parseInt(byte, 16)),
});
export const activePrint = () => instaxStatus('000229127f0b00000000');
export const knownEmptyError = () => instaxStatus('000229f4f00b00000010');
