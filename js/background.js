'use strict';

(async () => {
    let timerBusy;
    let timerStartDate;
    let timerStartTime;
    let timerRuntime;
    let timerTaskName;
    let timerTaskDescription;
    let timerInterval;

    await addMessagesListener();

    async function addMessagesListener() {
        const delegateMessage = async (request) => {
            if (!request || !request.to || request.to !== 'background') {
                return;
            }

            switch (request.type) {
                case 'timer_start':
                    startTimer(request);
                    break;
                case 'timer_stop':
                    await stopTimer(request);
                    break;
            }
        };

        chrome.runtime.onMessage.addListener(delegateMessage);
    }

    function startTimer(request) {
        if (timerBusy) {
            return;
        }

        if (!request.data
            || !request.data.taskName
            || !request.data.taskDescription) {
            return;
        }

        timerBusy = true;
        timerTaskName = request.data.taskName;
        timerTaskDescription = request.data.taskDescription;

        const intervalCallback = () => {
            timerRuntime = performance.now() - timerStartTime;
            chrome.runtime.sendMessage({
                from: 'background',
                to: 'popup',
                type: 'timer_data',
                data: {
                    status: 'ongoing',
                    taskName: timerTaskName,
                    taskDescription: timerTaskDescription,
                    taskStartDate: timerStartDate,
                    taskTimer: timerRuntime,
                }
            });
        };

        timerStartDate = new Date();
        timerStartTime = performance.now();
        timerInterval = setInterval(intervalCallback, 200);
    }

    async function stopTimer(request) {
        if (!timerBusy) {
            return;
        }

        clearInterval(timerInterval);

        const localISOTime = timerStartDate.toISOString().slice(0, -1);
        const dataToSend = {
            comment: timerTaskDescription,
            started: `${localISOTime}+0000`,
            timeSpent: parseTime(timerRuntime),
        };

        let jiraServerAddress;
        try {
            jiraServerAddress = await fetchJiraCredentials();
        } catch (e) {
            showNotification('error', 'Jira server address not found');
            console.error('Fetching jira server address error:', e);
            return;
        }
        const url = `${jiraServerAddress}/rest/api/2/issue/${timerTaskName}/worklog?adjustEstimate=AUTO`;

        let response;
        try {
            response = await fetch(url, {
                headers: {"Content-Type": "application/json; charset=utf-8"},
                method: 'POST',
                body: JSON.stringify(dataToSend),
            });
        } catch (e) {
            showNotification('error', 'Saving tracked time error');
            console.error('Saving tracked time error:', e);
            return;
        }

        handleStopTheTimer();
        switch (response.status) {
            case 201:
                showNotification('success', 'Successfully saved tracked time!');
                return;
            case 404:
                showNotification('error', 'Ticket not found');
                return;
            default:
                showNotification('error', 'Something went wrong');
                return;
        }
    }

    function restartTimer() {
        timerBusy = false;
        timerTaskName = undefined;
        timerTaskDescription = undefined;
        timerRuntime = undefined;
        timerStartDate = undefined;
        timerStartTime = undefined;
        timerInterval = undefined;
    }

    function handleStopTheTimer() {
        restartTimer();

        chrome.runtime.sendMessage({
            from: 'background',
            to: 'popup',
            type: 'timer_data',
            data: {
                status: 'stopped',
            }
        });
    }

    function fetchJiraCredentials() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(['jira_tracker_api_host'], (storageObject) => {
                if (storageObject
                    && storageObject.jira_tracker_api_host) {
                    resolve(storageObject.jira_tracker_api_host);
                    return;
                }
                reject('Key \'jira_tracker_api_host\' not found.');
            });
        });
    }

    function parseTime(timerRuntime) {
        const runtimeToSeconds = timerRuntime / 1000;
        const totalMinutes = Math.ceil(runtimeToSeconds / 60);

        return `${totalMinutes}m`;
    }

    function showNotification(type, message) {
        chrome.runtime.sendMessage({
            from: 'background',
            to: 'popup',
            type: 'timer_notification',
            data: {
                notification: type,
                message,
            }
        });
    }
})();
