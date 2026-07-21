const allowedRoles = ["admin", "organizer"];
const supportedLanguages = new Set(["es", "en", "it", "pt", "fr"]);

document.addEventListener("DOMContentLoaded", async () => {
    await ensureTranslationsReady();
    await WaitEventLoaded();

    const currentEvent = getEvent();
    const currentUser = getUserFromToken();
    const now = new Date();
    const storedLang = localStorage.getItem("lang");
    const eventLanguage = String(currentEvent?.language || "").toLowerCase();

    if (!storedLang && supportedLanguages.has(eventLanguage)) {
        await changeLanguage(eventLanguage);
    }

    if (currentEvent.notice_active && currentEvent.notice_text.trim() !== "") {
        const noticePanel = document.getElementById("noticePanel");
        const noticeInnerPanel = document.getElementById("notice_type");
        const noticeTextDiv = document.getElementById("notice_text");

        noticeInnerPanel.classList.add(`alert-${currentEvent.notice_type === "IMP" ? "danger" : "success"}`);
        noticeTextDiv.innerText = currentEvent.notice_text;
        noticePanel.style.display = "block";
    }

    updateElementProperty("event-logo", "src", currentEvent.eventLogo);
    updateElementProperty("configUrl", "href", `?eventId=${eventId}`, false);
    updateElementProperty("votingUrl", "href", `?eventId=${eventId}`, false);
    updateElementProperty("participantsUrl", "href", `?eventId=${eventId}`, false);
    updateElementProperty("scheduleUrl", "href", `?eventId=${eventId}`, false);
    updateElementProperty("resultsUrl", "href", `?eventId=${eventId}`, false);
    updateElementProperty("statisticsUrl", "href", `?eventId=${eventId}`, false);
    updateElementProperty("audienceVoteUrl", "href", `?eventId=${encodeURIComponent(currentEvent.id)}`, false);

    const principalContainer = document.getElementById("principalContainer");
    const hiddenMessage = document.getElementById("eventHiddenMessage");
    const accessRow = document.getElementById("home-access-row");
    const publicRow = document.getElementById("home-public-row");
    const configCol = document.getElementById("col-configUrl");
    const votingCol = document.getElementById("col-votingUrl");
    const participantsCol = document.getElementById("col-participantsUrl");
    const scheduleCol = document.getElementById("col-scheduleUrl");
    const resultsCol = document.getElementById("col-resultsUrl");
    const statisticsCol = document.getElementById("col-statisticsUrl");
    const audienceVoteCol = document.getElementById("col-audienceVoteUrl");
    const registrationCol = document.getElementById("col-registrationUrl");

    const showColumn = (column) => {
        if (column) column.classList.remove("d-none");
    };

    const removeColumn = (column) => {
        if (column) column.remove();
    };

    const syncRowVisibility = (row) => {
        if (!row) return;
        const hasVisibleColumns = Array.from(row.children).some((column) => !column.classList.contains("d-none"));
        row.classList.toggle("d-none", !hasVisibleColumns);
    };

    if (
        currentUser &&
        (
            currentUser.role === "admin" ||
            ((currentUser.role === "organizer" || currentUser.role === "school") && currentUser.eventId === eventId)
        )
    ) {
        updateElementProperty("registrationUrl", "href", `registration.html?eventId=${encodeURIComponent(eventId)}`);
    } else {
        updateElementProperty("registrationUrl", "href", `registrationhome.html?eventId=${encodeURIComponent(eventId)}`);
    }

    if (validateRoles(allowedRoles, false)) {
        showColumn(configCol);
        if (currentUser.role === "admin") showColumn(votingCol);
        showColumn(participantsCol);
        showColumn(scheduleCol);
        showColumn(resultsCol);
        showColumn(statisticsCol);

        if (["admin", "organizer"].includes(currentUser.role) && currentEvent.hasRegistration) {
            showColumn(registrationCol);
        }
    } else if (currentEvent.visible) {
        if (!currentUser || !["admin", "organizer"].includes(currentUser.role)) {
            removeColumn(configCol);
        } else {
            showColumn(configCol);
        }

        if (
            !currentUser ||
            !["admin", "judge"].includes(currentUser.role) ||
            (currentUser.role === "judge" && currentEvent.status === "finished") ||
            currentEvent.visibleJudges == 0
        ) {
            removeColumn(votingCol);
        } else {
            showColumn(votingCol);
        }

        if (currentEvent.visibleParticipants == 0) {
            removeColumn(participantsCol);
        } else {
            showColumn(participantsCol);
        }

        if (currentEvent.visibleSchedule == 0) {
            removeColumn(scheduleCol);
        } else {
            showColumn(scheduleCol);
        }

        const canJudgeSeeResults = currentUser && currentUser.role === "judge" && currentEvent.judgesVisResults === true;

        if (currentEvent.visibleResults == 0 && !canJudgeSeeResults) {
            removeColumn(resultsCol);
        } else {
            showColumn(resultsCol);
        }

        if (currentEvent.visibleStatistics == 0) {
            removeColumn(statisticsCol);
        } else {
            showColumn(statisticsCol);
        }

        const registrationClosed =
            !currentEvent.hasRegistration ||
            currentEvent.status !== "upcoming";

        if (registrationClosed) {
            removeColumn(registrationCol);
        } else {
            showColumn(registrationCol);
        }
    } else {
        principalContainer.classList.add("d-none");
        hiddenMessage.classList.remove("d-none");
        return;
    }

    if (currentEvent.hasAudienceVoting) {
        showColumn(audienceVoteCol);
    }

    syncRowVisibility(accessRow);
    syncRowVisibility(publicRow);
});
