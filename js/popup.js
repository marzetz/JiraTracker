'use strict';

(async () => {
    let jiraServerAddress;
    let jiraTasksList = [];
    let jiraTasksListFiltered = [];

    let elementTaskNameInput;
    let elementTaskDescriptionTextarea;
    let elementTaskDataButtonStart;
    let elementTaskDataButtonStop;
    let elementTaskTimer;
    let elementTaskNameInputHints;
    let elementTimerNotification;
    let elementTaskNameInputDebounceTimeoutId;

    let notificationVisibilityTimeout;
    let notificationStatusTimeout;

    async function init() {
        await checkIfJiraCredentialsProvided();
        fetchJiraTasks();
        addMessagesListener();
        assignDomElements();
        addTaskNameInputChangesListener();
        addStartButtonListener();
        addStopButtonListener();
        initTimer();
    }

    async function checkIfJiraCredentialsProvided() {
        try {
            jiraServerAddress = await fetchJiraCredentials();
        } catch (e) {
            chrome.tabs.create({url: './../html/connection.html'})
        }
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

    function addMessagesListener() {
        const delegateMessage = (request) => {
            if (!request || !request.to || request.to !== 'popup') {
                return;
            }

            switch (request.type) {
                case 'timer_data':
                    timerDataChanged(request);
                    break;
                case 'timer_notification':
                    getDataAndShowNotification(request);
                    break;
            }
        };

        chrome.runtime.onMessage.addListener(delegateMessage);
    }

    function assignDomElements() {
        elementTaskNameInput = document.querySelector('#input_task_name');
        elementTaskNameInputHints = document.querySelector('#input_task_name_hints');
        elementTaskDescriptionTextarea = document.querySelector('#textarea_task_description');
        elementTaskDataButtonStart = document.querySelector('#button_task_form_start');
        elementTaskDataButtonStop = document.querySelector('#button_task_form_stop');
        elementTaskTimer = document.querySelector('#timer');
        elementTimerNotification = document.querySelector('#timer_notification');
    }

    function addTaskNameInputChangesListener() {
        elementTaskNameInput
        && elementTaskNameInput.addEventListener('keyup', taskNameInputChangeHandler);
    }

    function addStartButtonListener() {
        elementTaskDataButtonStart
        && elementTaskDataButtonStart.addEventListener('click', buttonClickedHandler.bind(this, 'start'));
    }

    function addStopButtonListener() {
        elementTaskDataButtonStop
        && elementTaskDataButtonStop.addEventListener('click', buttonClickedHandler.bind(this, 'stop'));
    }

    function initTimer() {
        elementTaskTimer.innerHTML = parseTime(0);
    }

    function taskNameInputChangeHandler() {
        if (elementTaskNameInputDebounceTimeoutId) {
            clearTimeout(elementTaskNameInputDebounceTimeoutId);
        }

        elementTaskNameInputDebounceTimeoutId = setTimeout(() => {
            const searchString = elementTaskNameInput.value.length >= 3 ? elementTaskNameInput.value.toLowerCase() : '';

            if (!searchString.length) {
                jiraTasksListFiltered = [];
            } else {
                jiraTasksListFiltered = jiraTasksList.filter((taskHint) =>
                    taskHint.key.toLowerCase().includes(searchString)).slice(0, 10);
            }
            refreshDomHintsElements();
            clearTimeout(elementTaskNameInputDebounceTimeoutId);
        }, 500);
    }

    function removeAllHintsElements() {
        while (elementTaskNameInputHints.firstChild) {
            elementTaskNameInputHints.removeChild(elementTaskNameInputHints.lastChild);
        }
    }

    function refreshDomHintsElements() {
        removeAllHintsElements();
        jiraTasksListFiltered.forEach((hint) => {
            const element = document.createElement('A');
            element.innerHTML = hint.key;
            element.onclick = (() => {
                elementTaskNameInput.value = hint.key;
                removeAllHintsElements();
            });
            elementTaskNameInputHints.appendChild(element);
        });
    }

    function buttonClickedHandler(action) {
        let type;
        let data;

        switch (action) {
            case 'start':
                if (!elementTaskNameInput.value || !elementTaskDescriptionTextarea.value) {
                    timerShowNotification('error', 'Provide task name and description!');
                    return;
                }
                type = 'timer_start';
                data = {
                    data: {
                        taskName: elementTaskNameInput.value,
                        taskDescription: elementTaskDescriptionTextarea.value,
                    }
                };
                break;
            case 'stop':
                type = 'timer_stop';
                break;
        }

        chrome.runtime.sendMessage({
            from: 'popup',
            to: 'background',
            type,
            ...data && data,
        });

        removeAllHintsElements();
    }

    function timerDataChanged(request) {
        if (!request.data) {
            return;
        }

        if (request.data.status !== 'ongoing') {
            elementTaskTimer.innerHTML = parseTime(0);
            elementTaskNameInput.removeAttribute('disabled');
            elementTaskNameInput.value = '';
            elementTaskDescriptionTextarea.removeAttribute('disabled');
            elementTaskDescriptionTextarea.value = '';
            elementTaskDataButtonStart.style.display = 'inline-block';
            elementTaskDataButtonStop.style.display = 'none';
            return;
        }

        if (request.data && request.data.taskTimer) {
            elementTaskTimer.innerHTML = parseTime(request.data.taskTimer);
        }

        if (!elementTaskNameInput.hasAttribute('disabled')) {
            elementTaskNameInput.setAttribute('disabled', 'disabled');
        }
        if (elementTaskNameInput.value !== request.data.taskName) {
            elementTaskNameInput.value = request.data.taskName;
        }

        if (!elementTaskDescriptionTextarea.hasAttribute('disabled')) {
            elementTaskDescriptionTextarea.setAttribute('disabled', 'disabled');
        }
        if (elementTaskDescriptionTextarea.value !== request.data.taskDescription) {
            elementTaskDescriptionTextarea.value = request.data.taskDescription;
        }

        if (elementTaskDataButtonStart.style.display !== 'none') {
            elementTaskDataButtonStart.style.display = 'none';
        }
        if (elementTaskDataButtonStop.style.display !== 'inline-block') {
            elementTaskDataButtonStop.style.display = 'inline-block';
        }
    }

    function parseTime(timerRuntime) {
        const addZeroIfNecessary = (timeAmount) => timeAmount < 10 ? `0${timeAmount}` : `${timeAmount}`;

        const runtimeInSeconds = timerRuntime / 1000;

        const fullHours = Math.floor(runtimeInSeconds / 3600);
        const fullMinutes = Math.floor((runtimeInSeconds - fullHours * 3600) / 60);
        const fullSeconds = Math.floor(runtimeInSeconds - fullHours * 3600 - fullMinutes * 60);

        return `${addZeroIfNecessary(fullHours)}:${addZeroIfNecessary(fullMinutes)}:${addZeroIfNecessary(fullSeconds)}`;
    }

    function getDataAndShowNotification(request) {
        if (!request.data || !request.data.notification || !request.data.message) {
            return;
        }
        timerShowNotification(request.data.notification, request.data.message);
    }

    function timerShowNotification(notification, message) {
        const clearLastNotification = () => {
            notificationStatusTimeout && clearTimeout(notificationStatusTimeout);
            notificationVisibilityTimeout && clearTimeout(notificationVisibilityTimeout);
            elementTimerNotification.classList.remove('notification-visible');
            elementTimerNotification.classList.remove('notification-error');
            elementTimerNotification.classList.remove('notification-success');
            elementTimerNotification.innerHTML = '';
        };

        clearLastNotification();

        elementTimerNotification.innerHTML = message;
        elementTimerNotification.classList.add('notification-visible');

        switch (notification) {
            case 'error':
                elementTimerNotification.classList.add('notification-error');
                break;
            case 'success':
                elementTimerNotification.classList.add('notification-success');
                break;
        }

        notificationStatusTimeout = setTimeout(() => {
            elementTimerNotification.classList.remove('notification-visible');
            notificationVisibilityTimeout = setTimeout(() => {
                elementTimerNotification.classList.remove('notification-error');
                elementTimerNotification.classList.remove('notification-success');
                elementTimerNotification.innerHTML = '';
                clearTimeout(notificationVisibilityTimeout);
            }, 400);
            clearTimeout(notificationStatusTimeout);
        }, 2000);
    }

    function fetchJiraTasks() {
        const fieldsSet = 'fields=issuetype,summary,status,resolution,created,updated';
        const maxResults = 'maxResults=1500';

        const url = `${jiraServerAddress}/rest/api/2/search?${fieldsSet}&${maxResults}`;

        fetch(url, {
            headers: {"Content-Type": "application/json; charset=utf-8"},
            method: 'GET'
        })
            .then((response) => response.json())
            .then((data) => {
                jiraTasksList = data.issues;
            })
            .catch(() => {
                timerShowNotification('error', 'Cannot fetch tasks hints');
            });
    }

    document.addEventListener('DOMContentLoaded', init, false);
})();
