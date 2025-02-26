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

### 콘솔 디버깅
```javascript
// 근무 기록 데이터 확인
chrome.storage.local.get(null, console.log)  // 전체 데이터 확인

// 특정 날짜의 근무 기록 확인
chrome.storage.local.get(['2024-02-04'], console.log)

// 주간 데이터 확인
chrome.storage.local.get(['weekly:2024-W05'], console.log)

// 월간 데이터 확인
chrome.storage.local.get(['monthly:2024-02'], console.log)

// 활성 세션 확인
chrome.storage.local.get(['activeSession'], console.log)
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

# 변경사항 (2024-02-04)

## 버그 수정
1. 근무 기록 조회 시 날짜 형식 불일치 문제 해결
   - 기존: 'YYYY-MM-DD' 형식만 지원
   - 변경: 'YYYY-MM-DD'와 'YYYY. M. D.' 두 가지 형식 모두 지원
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

## 근무 기록 관리 규칙

### 세션 관리
- 모든 시간은 timestamp 형식으로 저장
- 세션은 시작 시간 기준으로 날짜가 결정됨
- 자정을 넘기는 세션은 자동으로 분리됨
- 각 세션은 해당 날짜의 기록으로만 저장

### 데이터 무결성
- 종료 시간은 시작 시간보다 앞설 수 없음
- 중복 세션 저장 방지
- 모든 시간 관련 연산은 검증 포함

### 자정 처리
1. 현재 세션을 23:59:59.999에 종료
2. 새로운 세션을 00:00:00.000에 시작
3. 각각 해당 날짜에 기록
