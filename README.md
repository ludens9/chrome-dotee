# Dooteee Chrome Extension

프리랜서를 위한 근무시간 기록 크롬 확장프로그램

## 주요 기능

1. **근무 시간 기록**
   - 실시간 근무 시간 추적
   - 일간/주간/월간 통계
   - 자동 종료 타이머
   - 자정 자동 기록 전환

2. **일일 리포트**
   - 매일 이메일 발송
   - 전일 근무 시간 통계
   - 주간/월간 비교 데이터
   - 맞춤형 메시지

3. **오프라인 지원**
   - 오프라인 상태에서도 기록
   - 네트워크 복구 시 자동 동기화

## 시스템 구조

### 1. Background Service (background.js)
- 타이머 관리 및 상태 추적
- 알람 처리 (자동 종료, 자정 변경, 이메일 발송)
- 아이콘 애니메이션 관리

### 2. Storage System
- **StorageManager (storage.js)**
  - 작업 기록 저장/조회
  - 설정 관리
  - 통계 데이터 계산

- **QueueManager (queue.js)**
  - 오프라인 작업 큐 관리
  - 네트워크 복구 시 동기화

### 3. UI Components
- **PopupManager (popup.js)**
  - 메인 UI 관리
  - 실시간 상태 표시
  - 설정 인터페이스

### 4. Network & Email
- **NetworkManager (network.js)**
  - 네트워크 상태 모니터링
  - 오프라인/온라인 전환 처리

- **EmailService (email.js)**
  - 일일 리포트 발송
  - 이메일 템플릿 관리

## 파일 구조
