const REPAIR_STATUS = {
  PENDING: 'รอดำเนินการ',
  IN_PROGRESS: 'กำลังดำเนินการ',
  ON_HOLD: 'รออะไหล่',
  COMPLETED: 'เสร็จสิ้น',
  CANCELLED: 'ยกเลิก'
};

const INSTANCE_STATUS = {
  IN_STOCK: 'In Stock',
  WITHDRAWN: 'Withdrawn',
  UNDER_REPAIR: 'Under Repair',
  CLAIMING: 'Claiming',
  DAMAGED: 'Damaged',
  WITH_TECHNICIAN: 'With Technician' // custody: held in a technician's personal spare kit
};

module.exports = {
  REPAIR_STATUS,
  INSTANCE_STATUS
};
