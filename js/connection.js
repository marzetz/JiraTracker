'use strict';

(() => {
    let elementConnectionHostInput;
    let elementConnectionDataButtonSave;

    function init() {
        assignDomElements();
        addSaveButtonListener();
    }

    function assignDomElements() {
        elementConnectionHostInput = document.querySelector('#input_connection_host');
        elementConnectionDataButtonSave = document.querySelector('#button_connection_form_save');
    }

    function addSaveButtonListener() {
        elementConnectionDataButtonSave && elementConnectionDataButtonSave.addEventListener('click', saveCredentials);
    }

    function saveCredentials() {
        if (!elementConnectionHostInput
            || !elementConnectionHostInput.value) {
            alert('Provide the address to your jira server!');
            return;
        }

        chrome.storage.local.set({
            jira_tracker_api_host: elementConnectionHostInput.value,
        }, () => {
            elementConnectionHostInput.value = '';

            window.close();
        });
    }

    document.addEventListener('DOMContentLoaded', init, false);
})();
