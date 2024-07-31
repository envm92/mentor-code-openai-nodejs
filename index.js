'use strict';

const {createServer} = require('http');

const {WebSocketServer} = require('ws');
const OpenAI = require('openai');

const openai = new OpenAI();
const server = createServer(app);
const wss = new WebSocketServer({server});

function createThread() {
    return openai.beta.threads.create();
}

function addMessageToThread(threadId, message) {
    return openai.beta.threads.messages.create(threadId, {
        role: 'user',
        content: message
    });
}

function createRun(threadId, assitantId) {
    return openai.beta.threads.runs.stream(threadId, {assistant_id: assitantId});
}

wss.on('connection', function (ws) {

    createThread().then((thread) => {
        const currentThread = {
            thread_id: thread.id,
        }
        ws.send(JSON.stringify(currentThread));
    });

    let running = false;
    ws.on('message', (message) => {
        const res = JSON.parse(message);
        addMessageToThread(res.thread_id, res.message).then(resMessage => {
            running = true;
            createRun(res.thread_id, res.assistant_id)
                .on('textCreated', (text) => console.log(text))
                .on('textDelta', (textDelta, snapshot) => {
                    const textDeltaRes = {
                        text: textDelta.value,
                        running: running
                    }
                    ws.send(JSON.stringify(textDeltaRes));
                })
                .on('end', () => {
                    running = false;
                    const endMessage = {
                        running: running
                    }
                    ws.send(JSON.stringify(endMessage));
                });
        });
    });


    ws.on('error', console.error);

    ws.on('close', function () {
        console.log('stopping client interval');
    });
});

server.listen(8080, function () {
    console.log('Listening on http://localhost:8080');
});