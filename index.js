'use strict';

const express = require('express');
const cors = require('cors');
const {createServer} = require('http');

const {WebSocketServer} = require('ws');
const OpenAI = require('openai');

const app = express();
const openai = new OpenAI();
const server = createServer(app);
const wss = new WebSocketServer({server});
const {z} = require('zod');
const {zodResponseFormat} = require("openai/helpers/zod");

app.use(cors);


const CommentCodeEvent = z.object({
    old_code: z.string(),
    code: z.string(),
    language: z.string()
});

const RateEvent = z.object({
    rate: z.number(),
    reason: z.string()
});

const BigOEvent = z.object({
    bigO: z.string(),
    reason: z.string()
});

function createThread() {
    return openai.beta.threads.create();
}

function addMessageToThread(threadId, message) {
    return openai.beta.threads.messages.create(threadId, {
        role: 'user',
        content: message
    });
}

function createRun(threadId, assitantId, type, extraInstructions) {
    let body = {
        assistant_id: assitantId,
        stream: true,
        response_format: null,
        instructions: extraInstructions
    };
    switch (type) {
        case 'comment':
            body.response_format = zodResponseFormat(CommentCodeEvent, "comment_code");
            break;
        case 'rate':
            body.response_format = zodResponseFormat(RateEvent, "rate");
            break;
        case 'bigo':
            body.response_format = zodResponseFormat(BigOEvent, 'bigo');
    }
    return openai.beta.threads.runs.stream(threadId, body);
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
        addMessageToThread(res.thread_id, res.message).then(() => {
            running = true;
            createRun(res.thread_id, res.assistant_id, res.type, res.instructions)
                .on('textDelta', (textDelta) => {
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