class PopupManager {
  constructor() {
    this.initializeElements();
    this.initializeListeners();
    this.requestInitialState();
    this.loadSettings();
  }

  initializeElements() {
    this.workToggle = document.getElementById('work-toggle');
    this.autoStopSelect = document.getElementById('auto-stop');
    this.currentSessionEl = document.querySelector('.current-session');
    this.dateDisplayEl = document.querySelector('.date-display');
    this.totalTodayEl = document.querySelector('.total-today');
    this.settingsBtn = document.getElementById('settings-btn');
    this.backBtn = document.getElementById('back-btn');
    this.mainPage = document.getElementById('main-page');
    this.settingsPage = document.getElementById('settings-page');
    this.periodSelect = document.getElementById('period-select');
    this.hourSelect = document.getElementById('hour-select');
    this.minuteSelect = document.getElementById('minute-select');
    this.saveSettingsBtn = document.getElementById('save-settings');
    this.emailInput = document.getElementById('email-input');
  }

  initializeListeners() {
    // 백그라운드로부터의 메시지 수신
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'STATUS_UPDATED') {
        this.updateDisplay(message.data);
      }
    });

    // UI 이벤트 리스너
    this.workToggle.addEventListener('change', this.handleWorkToggle.bind(this));
    this.autoStopSelect.addEventListener('change', this.handleAutoStopChange.bind(this));
    this.settingsBtn.addEventListener('click', this.showSettingsPage.bind(this));
    this.backBtn.addEventListener('click', this.showMainPage.bind(this));
    this.periodSelect.addEventListener('change', this.handleTimeChange.bind(this));
    this.hourSelect.addEventListener('change', this.handleTimeChange.bind(this));
    this.minuteSelect.addEventListener('change', this.handleTimeChange.bind(this));
    this.saveSettingsBtn.addEventListener('click', this.handleSaveSettings.bind(this));

    // 이메일 발송 메시지 리스너 추가
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'SEND_EMAIL_REPORT') {
        this.sendEmailReport();
      }
    });
  }

  async requestInitialState() {
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'GET_STATUS'
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });
      
      if (response) {
        this.updateDisplay(response);
      }
    } catch (error) {
      console.error('상태 요청 실패:', error);
    }
  }

  updateDisplay(state) {
    if (!state) return;

    console.log('현재 상태:', state);

    this.workToggle.checked = state.isWorking;
    this.currentSessionEl.textContent = this.formatTime(state.currentSession || 0);
    
    // 근무 중일 때 자동종료 선택 비활성화
    this.autoStopSelect.disabled = state.isWorking;
    
    // 날짜 표시 업데이트
    const today = new Date();
    const dateStr = this.formatDate(today);
    this.dateDisplayEl.textContent = `${dateStr} 총누적시간`;
    // 초 단위를 시간으로 변환 (버림 처리)
    const totalMinutes = Math.floor((state.totalToday || 0) / 60);  // 전체 분
    const totalHours = Math.floor(totalMinutes / 60) + (Math.floor(totalMinutes % 60) / 60);
    this.totalTodayEl.textContent = `${totalHours.toFixed(1)}시간`;
    this.autoStopSelect.value = String(state.autoStopHours || 0);
  }

  handleWorkToggle(event) {
    const command = event.target.checked ? 'START_WORK' : 'STOP_WORK';
    console.log('작업 상태 변경:', command);
    
    chrome.runtime.sendMessage({
      type: command,
      data: {
        autoStopHours: null
      }
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('작업 상태 변경 실패:', chrome.runtime.lastError);
      }
    });
  }

  handleAutoStopChange(event) {
    // 문자열을 숫자로 변환 (parseFloat로 변경하여 소수점 처리)
    const value = parseFloat(event.target.value);
    console.log('Auto stop value:', {
      raw: event.target.value,
      parsed: value
    });
    
    chrome.runtime.sendMessage({
      type: 'SET_AUTO_STOP',
      data: value  // parseFloat 값 사용
    });
  }

  formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  formatDate(date) {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const dayOfWeek = days[date.getDay()];
    return `${month}.${day}(${dayOfWeek})`;
  }

  showSettingsPage() {
    this.mainPage.style.display = 'none';
    this.settingsPage.style.display = 'block';
    this.loadSettings();
  }

  showMainPage() {
    this.settingsPage.style.display = 'none';
    this.mainPage.style.display = 'block';
  }

  handleTimeChange() {
    const period = this.periodSelect.value;
    let hour = parseInt(this.hourSelect.value);
    const minute = parseInt(this.minuteSelect.value);
    
    // 24시간 형식으로 변환
    if (period === 'PM' && hour !== 12) {
      hour += 12;
    } else if (period === 'AM' && hour === 12) {
      hour = 0;
    }
    
    const timeString = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    console.log('Selected time:', timeString);
    
    // 임시 저장
    this.lastReportTime = timeString;
  }

  async handleSaveSettings() {
    const email = this.emailInput.value;
    
    // 이메일 유효성 검사
    if (!email) {
      alert('이메일 주소를 입력해주세요.');
      return;
    }
    
    if (!this.lastReportTime) {
      alert('발송 시간을 선택해주세요.');
      return;
    }

    try {
      // 저장 처리
      await chrome.storage.local.set({
        email: email,
        reportTime: this.lastReportTime
      });
      
      // 이메일 알람 재설정
      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: 'SETUP_EMAIL_ALARM' },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(response);
            }
          }
        );
      });
      
      alert('설정이 저장되었습니다.');
      this.showMainPage();
    } catch (error) {
      console.error('설정 저장 실패:', error);
      alert('설정 저장에 실패했습니다.');
    }
  }

  async loadSettings() {
    try {
      const settings = await chrome.storage.local.get(['email', 'reportTime']);
      if (settings.email) {
        this.emailInput.value = settings.email;
      }
      
      if (settings.reportTime) {
        // HH:MM 형식의 시간을 파싱
        const [hours, minutes] = settings.reportTime.split(':');
        const hour = parseInt(hours);
        const minute = parseInt(minutes);
        
        // 12시간 형식으로 변환
        const period = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
        
        // 선택값 설정
        this.periodSelect.value = period;
        this.hourSelect.value = String(hour12);
        this.minuteSelect.value = String(minute);
        
        // 저장된 시간 기억
        this.lastReportTime = settings.reportTime;
      }
    } catch (error) {
      console.error('설정 로드 실패:', error);
    }
  }

  async sendEmailReport() {
    try {
      const emailService = new EmailService();  // EmailService 인스턴스 생성
      const settings = await chrome.storage.local.get(['email', 'reportTime']);
      if (!settings.email) return;

      // 어제 날짜 계산
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      // 어제의 근무 기록 가져오기
      const workRecords = await chrome.storage.local.get('workRecords');
      const yesterdayRecords = workRecords.workRecords?.[yesterdayStr] || [];

      // 첫 출근, 마지막 퇴근 시간 계산
      let startTime = '기록 없음';
      let endTime = '기록 없음';
      let totalSeconds = 0;

      if (yesterdayRecords.length > 0) {
          startTime = new Date(yesterdayRecords[0].startTime).toLocaleTimeString('ko-KR', {
              hour: '2-digit',
              minute: '2-digit'
          });
          endTime = new Date(yesterdayRecords[yesterdayRecords.length - 1].endTime).toLocaleTimeString('ko-KR', {
              hour: '2-digit',
              minute: '2-digit'
          });
          totalSeconds = yesterdayRecords.reduce((total, record) => total + record.duration, 0);
      }

      // 주간 누적 시간 계산
      const weekStart = new Date(yesterday);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      
      let weekSeconds = 0;
      for (let d = new Date(weekStart); d <= yesterday; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split('T')[0];
          const dayRecords = workRecords.workRecords?.[dateStr] || [];
          weekSeconds += dayRecords.reduce((total, record) => total + record.duration, 0);
      }

      // 월간 누적 시간 계산
      const monthStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), 1);
      let monthSeconds = 0;
      for (let d = new Date(monthStart); d <= yesterday; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split('T')[0];
          const dayRecords = workRecords.workRecords?.[dateStr] || [];
          monthSeconds += dayRecords.reduce((total, record) => total + record.duration, 0);
      }

      // 요일 계산
      const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
      const weekday = weekdays[yesterday.getDay()];

      // EmailService를 사용하여 이메일 발송
      await emailService.sendEmail({
        to_email: settings.email,
        date: `${yesterday.getMonth() + 1}월 ${yesterday.getDate()}일`,
        weekday: weekday,
        start_time: startTime,
        end_time: endTime,
        total_hours: (totalSeconds / 3600).toFixed(1),
        week_hours: (weekSeconds / 3600).toFixed(1),
        month_hours: (monthSeconds / 3600).toFixed(1),
        has_notice: yesterdayRecords.length === 0,
        notices: yesterdayRecords.length === 0 ? ['어제는 근무 기록이 없습니다.'] : [],
        message: '오늘도 화이팅하세요! 🙂'
      });

      console.log('이메일 발송 완료');
    } catch (error) {
      console.error('이메일 발송 실패:', error);
    }
  }
}

// 팝업 초기화
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
}); 