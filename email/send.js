import { StorageManager } from '../js/storage.js';

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
        
        // StorageManager의 메서드 사용
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

        // StorageManager의 주간/월간 계산 메서드 사용
        const weekTotal = await StorageManager.getWeeklyTotal(yesterday);
        const lastWeekTotal = await StorageManager.getLastWeekTotal(yesterday);
        const monthTotal = await StorageManager.getMonthlyTotal(yesterday);
        const lastMonthTotal = await StorageManager.getLastMonthTotal(yesterday);

        // 요일 계산
        const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
        const weekday = weekdays[yesterday.getDay()];

        document.getElementById('status').textContent = '이메일 발송 중...';

        // 메시지 생성
        const timeBasedMessage = yesterdayRecords.length === 0 
            ? '어제는 근무 기록이 없습니다.'
            : getTimeBasedMessage(totalSeconds);

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