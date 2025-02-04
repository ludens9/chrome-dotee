async function runTests() {
  console.group('스토리지 테스트 시작');
  
  try {
    // 1. 현재 데이터 확인
    console.log('1. 현재 저장된 데이터 확인');
    await StorageManager.debugStorage();

    // 2. 테스트 데이터 생성 및 저장
    console.log('\n2. 테스트 데이터 저장');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const testRecord = {
      startTime: new Date(yesterday.setHours(9, 0, 0)).toISOString(),
      endTime: new Date(yesterday.setHours(18, 0, 0)).toISOString(),
      duration: 9 * 3600
    };
    
    console.log('저장할 테스트 데이터:', testRecord);
    await StorageManager.saveWorkRecord(testRecord);

    // 3. 저장된 데이터 확인
    console.log('\n3. 저장 후 데이터 확인');
    await StorageManager.debugStorage();

    // 4. 어제 날짜 기록 확인
    console.log('\n4. 어제 기록 확인');
    const records = await StorageManager.getWorkRecords(yesterday);
    console.log('어제 기록:', {
      날짜: yesterday.toISOString().split('T')[0],
      기록: records
    });

    console.log('\n테스트 완료!');
  } catch (error) {
    console.error('테스트 실패:', error);
  }
  
  console.groupEnd();
} 