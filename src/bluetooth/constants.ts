const uuid = (short: string) => `0000${short}-0000-1000-8000-00805f9b34fb`;
export const FTMS_SERVICE = uuid("1826"),
  FITNESS_MACHINE_FEATURE = uuid("2acc"),
  INDOOR_BIKE_DATA = uuid("2ad2"),
  FITNESS_MACHINE_STATUS = uuid("2ada"),
  SUPPORTED_RESISTANCE_LEVEL_RANGE = uuid("2ad6"),
  FITNESS_MACHINE_CONTROL_POINT = uuid("2ad9");
export const CYCLING_POWER_SERVICE = uuid("1818"),
  CYCLING_POWER_MEASUREMENT = uuid("2a63"),
  CYCLING_POWER_FEATURE = uuid("2a65");
