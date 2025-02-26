// weekdays는 email.js에서 정의된 것을 사용
function getTimeBasedMessage(totalSeconds, hasRecord = true) {
    if (!hasRecord) {
        return "어제 푹 쉬었으니 오늘은 상쾌하게 시작해봐요!";
    }
    
    const hours = totalSeconds / 3600;
    
    if (hours < 4) {
        return "어제는 짧게 일했네요! 오늘은 좀 더 힘내보는건 어때요?";
    } else if (hours < 8) {
        return "어제 하루 잘 마무리했어요! 오늘도 좋은 하루 만들어봐요!";
    } else {
        return "어제 진짜 열심히 일했네요! 오늘은 틈틈이 쉬면서하는건 어때요?";
    }
}

// 전역 객체에 할당
self.getTimeBasedMessage = getTimeBasedMessage; 