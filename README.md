# Dooteee Chrome Extension

## 핵심 구조

1. **Background Service (background.js)**
   - 타이머 관리 (시작, 정지, 자동 종료)
   - 상태 관리 및 저장
   - 알림 처리
   ```javascript
   // 주요 기능
   - 작업 시간 추적
   - 자동 종료 타이머
   - 상태 저장 및 복원
   ```

2. **Popup UI (popup.js)**
   - 사용자 인터페이스
   - 상태 표시
   - 설정 관리
   ```javascript
   // 주요 기능
   - 타이머 표시
   - 작업 시작/종료
   - 설정 변경
   ```

3. **Storage Manager (storage.js)**
   - 데이터 저장소
   - 설정 관리
   ```javascript
   // 저장 데이터
   - 작업 상태
   - 설정값
   - 작업 기록
   ```

## 파일 구조
