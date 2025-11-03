const MIN_STEP_DURATION = 4000;
const MAX_STEP_DURATION = 8000;

const INITIAL_MESSAGES = [
  '🤖 正在创建世界观蓝图(1/7)',
  '🧠 AI 正在分析世界观(2/7)',
  '📜 正在编织剧情框架(3/7)',
  '🔍 正在确定框架脉络与逻辑走向(4/7)',
  '💡 正在生成故事内容(5/7)',
  '🧾 AI 正在检查细节与连贯性(6/7)',
  '✨ 正在进行最终润色与校验(7/7)'
];

const INTERACTION_MESSAGES = [
  '🧩 正在分析你的选择(1/6)',
  '🔄 正在匹配你的决定(2/6)',
  '🤔 AI 正在理清故事逻辑(3/6)',
  '🪄 AI 正在确定剧情走向(4/6)',
  '💭 正在生成后续场景(5/6)',
  '✨ 正在进行最终润色与校验(6/6)'
];

Component({
  properties: {
    active: {
      type: Boolean,
      value: false,
      observer: 'handleActiveChange'
    },
    mode: {
      type: String,
      value: 'initial',
      observer: 'handleModeChange'
    },
    nightMode: {
      type: Boolean,
      value: false
    }
  },

  data: {
    currentMessage: '',
    textVisible: false,
    messageIndex: -1
  },

  lifetimes: {
    attached() {
      this._active = this.data.active;
      if (this.data.active) {
        this.startSequence();
      }
    },
    detached() {
      this.clearTimers();
    }
  },

  methods: {
    handleActiveChange(active) {
      this._active = active;
      if (active) {
        this.startSequence();
      } else {
        this.clearTimers();
        this.setData({
          currentMessage: '',
          messageIndex: -1,
          textVisible: false
        });
      }
    },

    handleModeChange() {
      if (this._active) {
        this.startSequence();
      }
    },

    startSequence() {
      this.clearTimers();
      const messages = this.getMessagePool();
      if (!messages.length) {
        return;
      }
      this.transitionToMessage(0, true);
    },

    transitionToMessage(index, immediate = false) {
      if (!this._active) {
        return;
      }
      const messages = this.getMessagePool();
      const normalizedIndex = Math.min(index, messages.length - 1);
      const nextMessage = messages[normalizedIndex];
      const delay = immediate || !this.data.currentMessage ? 30 : 150;

      if (this._fadeTimer) {
        clearTimeout(this._fadeTimer);
        this._fadeTimer = null;
      }

      this.setData({ textVisible: false });

      this._fadeTimer = setTimeout(() => {
        if (!this._active) {
          return;
        }
        this.setData({
          currentMessage: nextMessage,
          messageIndex: normalizedIndex,
          textVisible: true
        });
        this._fadeTimer = null;
      }, delay);

      if (normalizedIndex >= messages.length - 1) {
        return;
      }

      const nextDelay = this.randomStepDuration();

      if (this._messageTimer) {
        clearTimeout(this._messageTimer);
        this._messageTimer = null;
      }

      this._messageTimer = setTimeout(() => {
        if (!this._active) {
          return;
        }
        this.transitionToMessage(normalizedIndex + 1);
        this._messageTimer = null;
      }, nextDelay);
    },

    randomStepDuration() {
      return (
        Math.floor(Math.random() * (MAX_STEP_DURATION - MIN_STEP_DURATION + 1)) +
        MIN_STEP_DURATION
      );
    },

    getMessagePool() {
      return this.properties.mode === 'interaction' ? INTERACTION_MESSAGES : INITIAL_MESSAGES;
    },

    clearTimers() {
      if (this._messageTimer) {
        clearTimeout(this._messageTimer);
        this._messageTimer = null;
      }
      if (this._fadeTimer) {
        clearTimeout(this._fadeTimer);
        this._fadeTimer = null;
      }
    }
  }
});
