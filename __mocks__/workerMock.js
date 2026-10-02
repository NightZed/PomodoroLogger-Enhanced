function Worker() {
    this.listener = undefined;
}
Worker.prototype.removeEventListener = function(channel, listener){
    this.listener = undefined;
};
Worker.prototype.addEventListener = function(channel, listener){
    this.listener = listener;
};
Worker.prototype.postMessage = function(message){
    if (this.listener == null) {
        return;
    }

    // A real Worker delivers a MessageEvent whose payload lives under `data`.
    this.listener({
        data: {
            type: 'JEST_MOCK',
            code: message.code,
            payload: {}
        }
    });
};

module.exports = Worker;
