const { Plugin, PluginSettingTab, Setting, Notice, Modal } = require('obsidian');

// ==================== НАСТРОЙКИ ====================
const DEFAULT_SETTINGS = {
    blockNotifications: true,
    blockSystemNotices: true,
    blockFilePushNotifications: true,
    hideSidebars: true,
    autoStartBreakTimer: false,
    defaultFocusMinutes: 25,
    collectAnalytics: true,
};

module.exports = class FocusModePlus extends Plugin {
async startFocusSession(customMinutes) {
        if (this.isFocusActive) return;
        
        const minutes = customMinutes || this.settings.defaultFocusMinutes;
        
        // Активируем блокировку уведомлений
        if (this.settings.blockNotifications) {
            this.notificationBlocker.activate();
        }
        
        this.applyUILimitations();
        this.timer.start(minutes, false);
        this.isFocusActive = true;
        this.currentSessionStart = Date.now();
        
        this.updateFocusButton();
        
        const level = this.stats.getCurrentLevel();
        new Notice(`🧘 Режим фокуса ВКЛЮЧЕН (${minutes} мин) | Уведомления отключены | Ваш уровень: ${level.name} ${level.icon}`);
        
        // Дополнительное уведомление о блокировке
        if (this.settings.blockNotifications) {
            console.log("[Focus Mode] Все уведомления заблокированы на время сессии");
        }
    }

async endFocusSession(completed) {
        if (!this.isFocusActive) return;
        
        const duration = this.currentSessionStart ? (Date.now() - this.currentSessionStart) / 1000 : 0;
        
        // Деактивируем блокировку уведомлений
        if (this.settings.blockNotifications) {
            this.notificationBlocker.deactivate();
        }
        
        if (this.timer) this.timer.stop();
        this.restoreUI();
        
        if (duration > 30) {
            const session = {
                startTime: this.currentSessionStart,
                endTime: Date.now(),
                durationSeconds: duration,
                completed: completed,
                interrupted: !completed
            };
            this.stats.addSession(session);
            await this.saveStats();
            
            const newAchievements = this.stats.checkAchievements();
            for (const ach of newAchievements) {
                new Notice(`🏆 Новое достижение: ${ach.name}!`);
            }
            
            const level = this.stats.getCurrentLevel();
            const progress = this.stats.getProgressToNextLevel();
            if (progress < 100) {
                new Notice(`${level.icon} Прогресс к следующему уровню: ${Math.round(progress)}%`);
            }
        }
        
        this.isFocusActive = false;
        this.currentSessionStart = null;
        this.updateFocusButton();
        
        new Notice(completed ? "Фокус-сессия завершена! Хорошая работа ✨" : "Режим фокуса ВЫКЛЮЧЕН");
    }
    
async toggleFocusMode() {
        if (this.isFocusActive) {
            await this.endFocusSession(false);
        } else {
            await this.startFocusSession();
        }
    }

}
class FocusTimer {
    constructor(statusBar, onComplete) {
        this.statusBarItem = statusBar;
        this.onCompleteCallback = onComplete;
        this.timerInterval = null;
        this.isRunning = false;
        this.remainingSeconds = 0;
        this.updateDisplay("⏱️ Фокус не активен");
    }
    
    updateDisplay(text) {
        if (typeof text === 'string') {
            this.statusBarItem.setText(text);
        } else {
            const mins = Math.floor(this.remainingSeconds / 60);
            const secs = this.remainingSeconds % 60;
            const icon = this.isBreak ? "☕" : "🎯";
            this.statusBarItem.setText(`${icon} ${mins}:${secs.toString().padStart(2,'0')}`);
        }
    }
    
    start(durationMinutes, isBreakMode = false) {
        this.stop();
        this.isBreak = isBreakMode;
        this.remainingSeconds = durationMinutes * 60;
        this.endTime = Date.now() + this.remainingSeconds * 1000;
        this.isRunning = true;
        this.updateDisplay();
        
        this.timerInterval = setInterval(() => {
            if (!this.isRunning) return;
            this.remainingSeconds = Math.max(0, Math.floor((this.endTime - Date.now()) / 1000));
            this.updateDisplay();
            if (this.remainingSeconds <= 0) this.complete();
        }, 100);
    }
    
    complete() {
        this.stop();
        new Notice(this.isBreak ? "Перерыв окончен!" : "Фокус-сессия завершена! 🎉");
        this.onCompleteCallback();
    }
    
    stop() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        this.isRunning = false;
        this.updateDisplay("⏱️ Фокус не активен");
    }
}