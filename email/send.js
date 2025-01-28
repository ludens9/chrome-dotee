// import 문 제거
// getTimeBasedMessage 함수는 messageUtil.js에서 전역으로 사용 가능

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

async function calculateDailyTotal(date) {
    try {
        const { workRecords = {} } = await chrome.storage.local.get('workRecords');
        const dateStr = date.toISOString().split('T')[0];
        const dayRecords = workRecords[dateStr] || [];
        
        // 유효한 기록만 필터링
        const validRecords = dayRecords.filter(record => {
            const duration = record.duration || 0;
            return duration > 0 && duration < 24 * 60 * 60;
        });
        
        // 시간순 정렬
        validRecords.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
        
        let totalSeconds = 0;
        validRecords.forEach(record => {
            const start = new Date(record.startTime);
            
            // 날짜가 다른 경우 제외
            if (start.toISOString().split('T')[0] !== dateStr) {
                return;
            }
            
            totalSeconds += record.duration;
        });
        
        return totalSeconds;
    } catch (error) {
        console.error('일간 합계 계산 실패:', error);
        return 0;
    }
}

async function cleanupInvalidRecords() {
    try {
        const { workRecords = {} } = await chrome.storage.local.get('workRecords');
        
        // 유효한 기록만 필터링
        const cleanedRecords = {};
        
        Object.entries(workRecords).forEach(([date, records]) => {
            // 1970년 데이터 제외
            if (date.startsWith('1970')) return;
            
            // 유효한 기록만 필터링
            const validRecords = records.filter(record => {
                return record.startTime && record.endTime && 
                       record.duration > 0 && record.duration < 24 * 60 * 60; // 24시간 이내
            });
            
            if (validRecords.length > 0) {
                cleanedRecords[date] = validRecords;
            }
        });
        
        // 정리된 데이터 저장
        await chrome.storage.local.set({ workRecords: cleanedRecords });
        console.log('데이터 정리 완료:', cleanedRecords);
        
        return cleanedRecords;
    } catch (error) {
        console.error('데이터 정리 실패:', error);
        return null;
    }
}

// 모든 근무 기록 출력 함수 추가
async function printAllWorkRecords() {
    try {
        const { workRecords = {} } = await chrome.storage.local.get('workRecords');
        
        console.log('===== 전체 근무 기록 =====');
        console.log('총 날짜 수:', Object.keys(workRecords).length);
        
        // 날짜순으로 정렬
        const sortedDates = Object.keys(workRecords).sort();
        
        sortedDates.forEach(date => {
            const records = workRecords[date];
            const dailyTotal = records.reduce((sum, record) => sum + (record.duration || 0), 0);
            
            console.log(`\n[${date}] - ${records.length}개 기록`);
            console.log(`일간 총 근무시간: ${Math.floor(dailyTotal/3600)}시간 ${Math.floor((dailyTotal%3600)/60)}분`);
            
            records.forEach((record, index) => {
                console.log(`  ${index + 1}. ${new Date(record.startTime).toLocaleTimeString()} ~ ${new Date(record.endTime).toLocaleTimeString()}`);
                console.log(`     duration: ${record.duration}초 (${Math.floor(record.duration/3600)}시간 ${Math.floor((record.duration%3600)/60)}분)`);
            });
        });
        
    } catch (error) {
        console.error('근무 기록 출력 실패:', error);
    }
}

async function sendDailyReport() {
    try {
        const settings = await chrome.storage.local.get(['email', 'reportTime']);
        if (!settings.email) {
            throw new Error('이메일 설정이 없습니다.');
        }

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        const { workRecords = {} } = await chrome.storage.local.get('workRecords');
        const yesterdayRecords = workRecords[yesterdayStr] || [];

        // 세션 수 계산 - 유효한 기록만 카운트
        const total_sessions = yesterdayRecords.filter(record => 
            record.startTime && 
            record.endTime && 
            record.duration > 0 && 
            record.duration < 24 * 60 * 60
        ).length;

        // 첫 출근, 마지막 퇴근 시간 계산
        let startTime = '기록 없음';
        let endTime = '기록 없음';

        if (yesterdayRecords.length > 0) {
            startTime = new Date(yesterdayRecords[0].startTime).toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit'
            });
            endTime = new Date(yesterdayRecords[yesterdayRecords.length - 1].endTime).toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        const totalSeconds = yesterdayRecords.reduce((sum, record) => sum + (record.duration || 0), 0);
        const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
        const weekday = weekdays[yesterday.getDay()];

        const timeBasedMessage = yesterdayRecords.length === 0 
            ? getTimeBasedMessage(0, false)
            : getTimeBasedMessage(totalSeconds, true);

        const emailService = new EmailService();
        await emailService.sendEmail({
            to_email: settings.email,
            date: `${yesterday.getMonth() + 1}월 ${yesterday.getDate()}일`,
            weekday: weekday,
            start_time: startTime,
            end_time: endTime,
            total_hours: (totalSeconds / 3600).toFixed(1),
            week_hours: (await calculateWeeklyTotal(yesterday) / 3600).toFixed(1),
            last_week_hours: (await calculateWeeklyTotal(new Date(yesterday.getTime() - 7 * 24 * 60 * 60 * 1000)) / 3600).toFixed(1),
            month_hours: (await calculateMonthlyTotal(yesterday) / 3600).toFixed(1),
            last_month_hours: (await calculateMonthlyTotal(new Date(yesterday.getFullYear(), yesterday.getMonth() - 1, yesterday.getDate())) / 3600).toFixed(1),
            message: timeBasedMessage,
            has_notice: yesterdayRecords.length === 0,
            notices: [],
            week_status: weekday,
            total_sessions: total_sessions
        });

        console.log('이메일 발송 완료');
        return true;

    } catch (error) {
        console.error('이메일 발송 실패:', error);
        throw error;
    }
}

// 함수 export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { sendDailyReport };
} 