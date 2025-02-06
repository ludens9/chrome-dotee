# Dooteee Chrome Extension

프리랜서를 위한 근무시간 기록 크롬 확장프로그램

## 주요 기능

1. **실시간 근무 기록**
   - 근무 시작/종료 자동 기록
   - 실시간 타이머 및 통계
   - 자동 종료 타이머 설정
   - 오프라인 지원 및 자동 동기화

2. **자정 자동 처리**
   - 날짜 변경 시 세션 자동 분할
   - 이전/새로운 날짜 데이터 정확한 기록
   - 에러 복구 및 백업 시스템
   ```javascript
   // 자정 처리 예시
   23:00 근무 시작 → 자정 지남 → 두 세션으로 분할
   1) 23:00~00:00 (1시간, 전날 기록)
   2) 00:00~현재 (현재 진행 중인 세션)
   ```

3. **일일 리포트**
   - 매일 전날의 근무 통계 이메일 발송
   - 일간/주간/월간 누적 시간
   - 맞춤형 피드백 메시지

## 시스템 아키텍처

### 1. 핵심 컴포넌트
- **WorkManager**: 전체 상태 관리 및 제어
- **MidnightManager**: 자정 처리 및 세션 관리
- **StorageManager**: 데이터 저장 및 통계 계산
- **EmailService**: 리포트 생성 및 발송

### 2. 데이터 처리
- 모든 시간은 로컬 기준으로 처리
- 시간 저장: timestamp (밀리초)
- 날짜 저장: 로컬 날짜 문자열
- 근무 시간: 초 단위 계산

### 3. 오류 처리
- 자동 백업 및 복구 시스템
- 오프라인 작업 큐 관리
- 상세 에러 로깅

## 기술 스택
- Chrome Extension Manifest V3
- Service Worker
- Chrome Storage API
- EmailJS API

## 파일 구조
```
├── background/
│   └── background.js     # 백그라운드 서비스
├── js/
│   ├── midnight.js       # 자정 처리 관리
│   ├── storage.js        # 데이터 저장소
│   ├── email.js          # 이메일 서비스
│   └── timer.js         # 타이머 관리
├── popup/
│   ├── popup.html       # 팝업 UI
│   └── popup.js         # 팝업 로직
└── email/
    └── template.html    # 이메일 템플릿
```

## 개발 가이드

### 시간 처리
```javascript
// 시작/종료 시간
startTime = now.getTime()
endTime = now.getTime()

// 날짜 저장
dateStr = new Date().toLocaleDateString()

// 시간 표시
timeStr = new Date().toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit'
})
```

### 테스트 포인트
1. 자정 전환
   - 세션 분할 정확성
   - 데이터 저장 검증
   - 타이머 연속성

2. 데이터 정합성
   - 날짜별 기록 정확성
   - 통계 계산 검증
   - 리포트 데이터 확인

# 변경사항 (2024-02-05)

## 버그 수정
1. 자정 세션 분할 문제 해결
   - 자정을 걸친 근무 시간이 정확하게 두 세션으로 분리되도록 수정
   - 예시: 23:00~01:00 근무 시
     ```
     이전 날짜: 23:00~00:00 (1시간)
     다음 날짜: 00:00~01:00 (1시간)
     ```

2. 주간/월간 통계 계산 개선
   - 날짜 키 형식 통일 (ISO 형식: YYYY-MM-DD)
   - 주간 범위를 월요일~일요일로 정확히 계산
   - 이전 주/월 통계 계산 로직 개선
   ```javascript
   // 예시: 2월 4일(일) 기준
   이번주: 1월 29일(월) ~ 2월 4일(일)
   지난주: 1월 22일(월) ~ 1월 28일(일)
   ```

## 개선사항
1. 로깅 시스템 강화
   - 날짜 범위 계산 과정 상세 로깅
   - 일별 집계 정보에 요일 추가
   - 에러 발생 시 더 자세한 정보 기록

2. 데이터 저장 구조 개선
   - 일관된 키 형식 사용으로 데이터 정합성 향상
   - 불필요한 키 변환 과정 제거

## 디버그 가이드

### 콘솔에서 근무기록 조회하기

1. **전체 데이터 조회**
```javascript
await StorageManager.debugStorage()
```

2. **특정 날짜 기록 조회**
```javascript
// 오늘 기록
const today = new Date().toISOString().split('T')[0];
const todayRecords = await StorageManager.getWorkRecords(today);
console.log('오늘 기록:', {
  날짜: today,
  기록수: todayRecords.length,
  세부기록: todayRecords.map(r => ({
    시작: new Date(r.startTime).toLocaleString(),
    종료: new Date(r.endTime).toLocaleString(),
    시간: (r.duration / 3600).toFixed(1) + '시간'
  }))
});

// 특정 날짜 기록 (YYYY-MM-DD 형식)
const date = '2024-02-20';
const records = await StorageManager.getWorkRecords(date);
console.log('근무 기록:', {
  날짜: date,
  기록수: records.length,
  세부기록: records.map(r => ({
    시작: new Date(r.startTime).toLocaleString(),
    종료: new Date(r.endTime).toLocaleString(),
    시간: (r.duration / 3600).toFixed(1) + '시간'
  }))
});
```

3. **주간 통계 조회**
```javascript
// 이번주 통계
const weekTotal = await StorageManager.getWeeklyTotal(new Date());
console.log('이번주 총 근무시간:', (weekTotal / 3600).toFixed(1) + '시간');

// 지난주 통계
const lastWeekTotal = await StorageManager.getLastWeekTotal(new Date());
console.log('지난주 총 근무시간:', (lastWeekTotal / 3600).toFixed(1) + '시간');
```

4. **월간 통계 조회**
```javascript
// 이번달 통계
const monthTotal = await StorageManager.getMonthlyTotal(new Date());
console.log('이번달 총 근무시간:', (monthTotal / 3600).toFixed(1) + '시간');

// 지난달 통계
const lastMonthTotal = await StorageManager.getLastMonthTotal(new Date());
console.log('지난달 총 근무시간:', (lastMonthTotal / 3600).toFixed(1) + '시간');
```

5. **데이터 초기화**
```javascript
// 전체 데이터 초기화
await StorageManager.clearAllData();

// 오늘 데이터만 초기화
await StorageManager.clearTodayData();
```

### 주의사항
- 콘솔 명령어는 크롬 확장프로그램의 팝업 창이나 백그라운드 페이지의 개발자 도구에서 실행해야 합니다.
- 날짜 형식은 반드시 'YYYY-MM-DD' 형식을 사용해야 합니다.
- 시간은 초 단위로 저장되며, 시간 단위로 변환하려면 3600으로 나누어야 합니다.

# 변경사항 (2024-02-06)

## 버그 수정
1. 비정상적인 누적 시간 계산 문제 해결
   - 자정 처리 시 누적 시간 초기화 로직 개선
   - 새로운 세션 시작 시 이전 누적 시간 정확히 계산
   ```javascript
   // 예시: 오후 2시 시작 → 현재 오후 3시
   현재세션: 1시간
   오늘누적: 1시간
   ```

2. 시작 시간 유효성 검사 추가
   - 유효하지 않은 시작 시간 자동 감지 및 보정
   - 미래 시간으로 설정된 경우 현재 시간으로 조정
   - 이전 날짜의 시작 시간인 경우 자동 초기화

3. 날짜 변경 감지 및 처리 개선
   - 실시간 날짜 변경 감지
   - 자정 시점에 정확한 세션 분할
   - 새로운 날짜에서 누적 시간 초기화

## 개선사항
1. 상태 관리 강화
   - 기본 상태 정의 및 일관된 초기화
   - 상태 변경 시 유효성 검사 추가
   - 비정상 상태 자동 복구 기능

2. 로깅 시스템 개선
   - 시간 계산 과정 상세 로깅
   - 상태 변경 시점 명확히 기록
   - 오류 발생 시 상세 정보 제공
