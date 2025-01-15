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

        document.getElementById('status').textContent = '이메일 발송 중...';

        // 새로운 EmailService 사용
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

        document.getElementById('status').textContent = '이메일 발송 완료!';
        setTimeout(() => window.close(), 3000);

    } catch (error) {
        console.error('이메일 발송 실패:', error);
        document.getElementById('status').textContent = '이메일 발송 실패: ' + error.message;
    }
}); 