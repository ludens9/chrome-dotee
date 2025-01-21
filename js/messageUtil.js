function getTimeBasedMessage(totalSeconds, hasRecord = true) {
    if (!hasRecord) {
        return `Had a good rest yesterday? Let's start fresh today! 😊
어제 푹 쉬었으니 오늘은 상쾌하게 시작해볼까? 😊`;
    }
    
    const hours = totalSeconds / 3600;
    
    if (hours < 4) {
        return `Yesterday was a short day! Shall we pump up the energy today? 🌱
어제는 짧게 일했네! 오늘은 좀 더 힘내볼까? 🌱`;
    } else if (hours < 8) {
        return `Nice job wrapping up yesterday! Let's make today another good one 🌟
어제 하루 잘 마무리했어! 오늘도 좋은 하루 만들어보자 🌟`;
    } else if (hours < 10) {
        return `You worked hard yesterday! Take it easy today, okay? ✨
어제 열심히 했으니 오늘은 적당히 쉬어가면서 하자 ✨`;
    } else {
        return `Wow, that was a long day yesterday! Remember to take breaks today 💪
어제 진짜 많이 일했다! 오늘은 틈틈이 쉬면서 하자 💪`;
    }
} 