class NetworkManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.initializeListeners();
  }

  initializeListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.handleOnline();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.handleOffline();
    });
  }

  async handleOnline() {
    console.log('네트워크 연결됨');
    // 오프라인 동안 쌓인 데이터 처리
    await QueueManager.processOfflineQueue();
  }

  handleOffline() {
    console.log('네트워크 연결 끊김');
    // 오프라인 모드로 전환
  }

  static isNetworkAvailable() {
    return navigator.onLine;
  }
} 