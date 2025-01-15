export const Commands = {
  START_WORK: 'START_WORK',
  STOP_WORK: 'STOP_WORK',
  GET_STATUS: 'GET_STATUS',
  SET_AUTO_STOP: 'SET_AUTO_STOP'
};

export const Events = {
  STATUS_UPDATED: 'STATUS_UPDATED',
  TIMER_TICK: 'TIMER_TICK',
  WORK_COMPLETED: 'WORK_COMPLETED',
  DAY_CHANGED: 'DAY_CHANGED'
};

export const DefaultState = {
  isWorking: false,
  startTime: null,
  currentSession: 0,
  totalToday: 0,
  savedTotalToday: 0
}; 