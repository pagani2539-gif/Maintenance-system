const DECIMAL_COORDINATE_PATTERN = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

export const GPS_COORDINATES_ERROR = 'กรุณาระบุพิกัด GPS ในรูปแบบ ละติจูด,ลองจิจูด เช่น 14.1083611,99.7096389';

export const validateGpsCoordinates = (value: string, required = false): string | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return required ? GPS_COORDINATES_ERROR : undefined;

  const parts = trimmed.split(',').map(part => part.trim());
  if (
    parts.length !== 2
    || !DECIMAL_COORDINATE_PATTERN.test(parts[0])
    || !DECIMAL_COORDINATE_PATTERN.test(parts[1])
  ) {
    return GPS_COORDINATES_ERROR;
  }

  const latitude = Number(parts[0]);
  const longitude = Number(parts[1]);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return 'ละติจูดต้องอยู่ระหว่าง -90 ถึง 90';
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return 'ลองจิจูดต้องอยู่ระหว่าง -180 ถึง 180';
  }

  return undefined;
};

export const formatGpsCoordinates = (latitude?: number | null, longitude?: number | null): string => {
  if (latitude == null || longitude == null) return '';
  return `${latitude},${longitude}`;
};
