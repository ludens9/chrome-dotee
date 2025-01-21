// import 문 제거
// getTimeBasedMessage 함수는 messageUtil.js에서 전역으로 사용 가능

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

async function calculateWeeklyTotal(baseDate) {
    try {
        const { workRecords = {} } = await chrome.storage.local.get('workRecords');
        const weekStart = new Date(baseDate);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);
        
        const weekStartStr = weekStart.toISOString().split('T')[0];
        const baseDateStr = baseDate.toISOString().split('T')[0];
        
        let weekTotal = 0;
        Object.entries(workRecords)
            .filter(([date]) => date >= weekStartStr && date <= baseDateStr)
            .forEach(([_, dayRecords]) => {
                weekTotal += dayRecords.reduce((sum, record) => sum + (record.duration || 0), 0);
            });
        
        return weekTotal;
    } catch (error) {
        console.error('주간 합계 계산 실패:', error);
        return 0;
    }
}

async function calculateMonthlyTotal(baseDate) {
    try {
        const { workRecords = {} } = await chrome.storage.local.get('workRecords');
        const monthStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
        monthStart.setHours(0, 0, 0, 0);
        
        const monthStartStr = monthStart.toISOString().split('T')[0];
        const baseDateStr = baseDate.toISOString().split('T')[0];
        
        let monthTotal = 0;
        Object.entries(workRecords)
            .filter(([date]) => date >= monthStartStr && date <= baseDateStr)
            .forEach(([_, dayRecords]) => {
                monthTotal += dayRecords.reduce((sum, record) => sum + (record.duration || 0), 0);
            });
        
        return monthTotal;
    } catch (error) {
        console.error('월간 합계 계산 실패:', error);
        return 0;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const emailService = new EmailService();
        const settings = await chrome.storage.local.get(['email', 'reportTime']);
        if (!settings.email) {
            throw new Error('이메일 설정이 없습니다.');
        }

        // 어제 날짜 계산
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        // 근무 기록 조회
        const { workRecords = {} } = await chrome.storage.local.get('workRecords');
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        const yesterdayRecords = workRecords[yesterdayStr] || [];

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

        // 주간/월간 통계 계산
        const weekTotal = await calculateWeeklyTotal(yesterday);
        const lastWeekTotal = await calculateWeeklyTotal(new Date(yesterday.getTime() - 7 * 24 * 60 * 60 * 1000));
        const monthTotal = await calculateMonthlyTotal(yesterday);
        const lastMonthTotal = await calculateMonthlyTotal(new Date(yesterday.getFullYear(), yesterday.getMonth() - 1, yesterday.getDate()));

        // 요일 계산
        const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
        const weekday = weekdays[yesterday.getDay()];

        document.getElementById('status').textContent = '이메일 발송 중...';

        // 메시지 생성
        const timeBasedMessage = yesterdayRecords.length === 0 
            ? getTimeBasedMessage(0, false)  // 근무 기록이 없는 경우
            : getTimeBasedMessage(totalSeconds, true);  // 근무 기록이 있는 경우

        // 이메일 발송
        await emailService.sendEmail({
            to_email: settings.email,
            date: `${yesterday.getMonth() + 1}월 ${yesterday.getDate()}일`,
            weekday: weekday,
            start_time: startTime,
            end_time: endTime,
            total_hours: (totalSeconds / 3600).toFixed(1),
            week_hours: (weekTotal / 3600).toFixed(1),
            last_week_hours: (lastWeekTotal / 3600).toFixed(1),
            month_hours: (monthTotal / 3600).toFixed(1),
            last_month_hours: (lastMonthTotal / 3600).toFixed(1),
            message: timeBasedMessage,
            has_notice: yesterdayRecords.length === 0,
            notices: [],
            week_status: `${weekday}일 기준`,
        });

        document.getElementById('status').textContent = '이메일 발송 완료!';
        setTimeout(() => window.close(), 3000);

    } catch (error) {
        console.error('이메일 발송 실패:', error);
        document.getElementById('status').textContent = '이메일 발송 실패: ' + error.message;
    }
}); 