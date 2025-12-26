import { Input, Output } from 'webmidi';

/**
 * Get a string listing device names for error messages.
 * @param {Input[] | Output[]} devices
 * @returns {string}
 */
export function getMidiDeviceNamesString(devices) {
  return devices.map((o) => `'${o.name}'`).join(' | ');
}

/**
 * Look up a device by index or name. Otherwise return a default device, or fail if none are connected.
 *
 * @param {string | number} indexOrName
 * @param {Input[] | Output[]} devices
 * @returns {Input | Output | undefined}
 */
export function getDevice(indexOrName, devices) {
  if (typeof indexOrName === 'number') {
    return devices[indexOrName];
  }
  const byName = (name) => devices.find((output) => output.name.includes(name));
  if (typeof indexOrName === 'string') {
    return byName(indexOrName);
  }
  // attempt to default to first IAC device if none is specified
  const IACOutput = byName('IAC');
  const device = IACOutput ?? devices[0];
  if (!device) {
    if (!devices.length) {
      throw new Error(`🔌 No MIDI devices found. Connect a device or enable IAC Driver.`);
    }
    throw new Error(`🔌 Default MIDI device not found. Use one of ${getMidiDeviceNamesString(devices)}`);
  }

  return device;
}
