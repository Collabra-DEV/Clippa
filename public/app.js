const $ = (selector) => document.querySelector(selector);
const cfg = window.CLIPPA_CONFIG || {};

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const PROCESSING_WAIT_MS = 30 * 60 * 1000;

let session = null;
let signup = false;
let videoUrl = null;
let jobRunning = false;

const configured = () =>
  /^https:\/\//.test(cfg.supabaseUrl || "") &&
  Boolean(cfg.supabaseAnonKey);

try {
  session = JSON.parse(
    sessionStorage.getItem("clippa-session") || "null"
  );
} catch {
  session = null;
}

/* Messages */

function toast(message) {
  const element = $("#toast");

  element.textContent = message;
  element.classList.add("show");

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    element.classList.remove("show");
  }, 4000);
}

/* Navigation */

function show(id) {
  const backButton = $("#backHome");

  if (backButton) {
    backButton.hidden = id === "home";
  }

  document.querySelectorAll("main > section").forEach((section) => {
    section.hidden = section.id !== id;
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll("[data-go]").forEach((button) => {
  button.onclick = () => show(button.dataset.go);
});

document.querySelectorAll("[data-close]").forEach((button) => {
  button.onclick = () => {
    const dialog = $("#" + button.dataset.close);
    if (dialog) dialog.close();
  };
});

$("#termsLink").onclick = () => $("#terms").showModal();
$("#authTerms").onclick = () => $("#terms").showModal();

$("#year").textContent = new Date().getFullYear();

$("#contactText").textContent = cfg.contactEmail
  ? "Contact: " + cfg.contactEmail
  : "Operator contact has not been configured. Account registration is not ready yet.";

/* Temporary workspace */

function clearWork() {
  if (videoUrl) {
    URL.revokeObjectURL(videoUrl);
  }

  videoUrl = null;

  $("#video").removeAttribute("src");
  $("#video").load();
  $("#video").hidden = true;

  $("#file").value = "";
  $("#filename").textContent = "";
  $("#name").value = "";

  $("#result").hidden = true;
  $("#clipResults").replaceChildren();
  $("#jobStatus").textContent = "";
  $("#projectList").replaceChildren();
}

/* Account state */

function storeSession() {
  try {
    if (session) {
      sessionStorage.setItem(
        "clippa-session",
        JSON.stringify(session)
      );
    } else {
      sessionStorage.removeItem("clippa-session");
    }
  } catch {
    // The current page can still use the session if storage is blocked.
  }
}

function applySession() {
  $("#account").textContent = session ? "Sign out" : "Sign in";
  $("#projectsNav").hidden = !session;

  $("#save").textContent = session
    ? "Save project settings"
    : "Sign in to save";

  $("#saveHint").textContent = session
    ? "Your account can save project titles and settings."
    : "Guest mode: your work disappears when you refresh or leave.";

  const badge = $("#planBadge");

  if (badge) {
    badge.textContent = "● Free plan";
  }
}

function authOpen() {
  $("#authStatus").textContent = configured()
    ? ""
    : "Accounts are not connected yet. You can continue as a guest.";

  $("#authSubmit").disabled = !configured();
  $("#auth").showModal();
}

/* Supabase requests */

async function request(
  path,
  { method = "GET", body, token = null } = {}
) {
  if (!configured()) {
    throw new Error("Supabase accounts are not configured yet.");
  }

  const response = await fetch(
    cfg.supabaseUrl.replace(/\/$/, "") + path,
    {
      method,
      headers: {
        apikey: cfg.supabaseAnonKey,
        "Content-Type": "application/json",
        ...(token
          ? { Authorization: "Bearer " + token }
          : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.msg ||
      data?.message ||
      data?.error_description ||
      "Request failed. Please try again."
    );
  }

  return data;
}

async function activeToken() {
  if (!session) {
    throw new Error("Please sign in.");
  }

  const expiresSoon =
    !session.expires_at ||
    session.expires_at < Date.now() / 1000 + 60;

  if (expiresSoon) {
    try {
      const next = await request(
        "/auth/v1/token?grant_type=refresh_token",
        {
          method: "POST",
          body: {
            refresh_token: session.refresh_token,
          },
        }
      );

      session = next;
      session.expires_at =
        Date.now() / 1000 + next.expires_in;

      storeSession();
    } catch {
      session = null;
      storeSession();
      clearWork();
      applySession();
      show("home");

      throw new Error(
        "Your session expired. Please sign in again."
      );
    }
  }

  return session.access_token;
}

/* Sign in and sign out */

$("#account").onclick = async () => {
  if (!session) {
    authOpen();
    return;
  }

  if (jobRunning) {
    toast("Wait for your clips to finish before signing out.");
    return;
  }

  try {
    await request("/auth/v1/logout", {
      method: "POST",
      token: await activeToken(),
    });
  } catch {
    // Always clear the local session when signing out.
  }

  session = null;
  storeSession();

  clearWork();
  applySession();
  show("home");

  toast("Signed out. Saved settings stay in your account.");
};

$("#toggleAuth").onclick = () => {
  signup = !signup;

  $("#authTitle").textContent = signup
    ? "Create your account."
    : "Welcome back.";

  $("#displayLabel").hidden = !signup;
  $("#consentLabel").hidden = !signup;
  $("#consent").required = signup;

  $("#password").autocomplete = signup
    ? "new-password"
    : "current-password";

  $("#authSubmit").textContent = signup
    ? "Create account"
    : "Sign in";

  $("#toggleAuth").textContent = signup
    ? "Already have an account? Sign in"
    : "New here? Create an account";

  $("#authStatus").textContent = configured()
    ? ""
    : "Accounts are not connected yet. Continue as a guest.";

  $("#authSubmit").disabled = !configured();
};

$("#authForm").onsubmit = async (event) => {
  event.preventDefault();

  if (!configured()) {
    $("#authStatus").textContent =
      "Accounts are not configured yet. Continue as a guest.";
    return;
  }

  if (jobRunning) {
    $("#authStatus").textContent =
      "Please wait for your clips to finish before signing in.";
    return;
  }

  if (signup && !cfg.contactEmail) {
    $("#authStatus").textContent =
      "Account registration opens after a support contact is configured.";
    return;
  }

  $("#authSubmit").disabled = true;
  $("#authStatus").textContent = signup
    ? "Creating your account…"
    : "Signing in…";

  try {
    const body = {
      email: $("#email").value.trim(),
      password: $("#password").value,
    };

    if (signup) {
      body.data = {
        display_name: $("#displayName").value.trim(),
        terms_accepted_at: new Date().toISOString(),
        terms_version: "2026-10-06",
      };
    }

    const path = signup
      ? "/auth/v1/signup"
      : "/auth/v1/token?grant_type=password";

    const data = await request(path, {
      method: "POST",
      body,
    });

    const result = data?.access_token
      ? data
      : data?.session;

    if (!result?.access_token) {
      $("#authStatus").textContent =
        "Check your email to confirm your account, then return and sign in.";

      $("#password").value = "";
      return;
    }

    clearWork();

    session = result;
    session.expires_at =
      Date.now() / 1000 + result.expires_in;

    storeSession();
    applySession();

    $("#auth").close();
    $("#password").value = "";

    show("studio");
    toast("Signed in. You can now save project settings.");
  } catch (error) {
    $("#authStatus").textContent = error.message;
  } finally {
    $("#authSubmit").disabled = !configured();
  }
};

/* Video selection */

$("#file").onchange = () => {
  const file = $("#file").files[0];

  if (!file) return;

  const looksLikeVideo =
    file.type.startsWith("video/") ||
    /\.(mp4|mov|webm|mkv|m4v|avi)$/i.test(file.name);

  if (!looksLikeVideo) {
    $("#file").value = "";
    toast("Please choose a video file.");
    return;
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    $("#file").value = "";
    toast("Choose a video no larger than 200 MB.");
    return;
  }

  if (videoUrl) {
    URL.revokeObjectURL(videoUrl);
  }

  videoUrl = URL.createObjectURL(file);

  $("#video").src = videoUrl;
  $("#video").hidden = false;

  const sizeMB = (file.size / 1024 / 1024).toFixed(1);

  $("#filename").textContent =
    file.name + " · " + sizeMB + " MB";

  if (!$("#name").value) {
    $("#name").value = file.name.slice(0, 100);
  }

  $("#result").hidden = true;
  $("#clipResults").replaceChildren();
  $("#jobStatus").textContent = "";
};

$("#video").onerror = () => {
  toast(
    "Your browser cannot preview this format. A standard MP4 usually works best."
  );
};

/* Settings and preview */

function settings() {
  return {
    title: $("#name").value.trim() || "Untitled project",
    clip_length: $("#length").value,
    caption_style: $("#caption").value,
  };
}

$("#preview").onclick = () => {
  if (!videoUrl) {
    toast("Choose a video first.");
    return;
  }

  const selected = settings();

  $("#resultText").textContent =
    selected.title +
    " · " +
    selected.clip_length +
    " · " +
    ($("#format").value === "vertical"
      ? "Vertical center crop"
      : "Original framing") +
    " · Automatic captions coming soon";

  $("#result").hidden = false;
};

/* Save project settings */

$("#save").onclick = async () => {
  if (!session) {
    authOpen();
    return;
  }

  $("#save").disabled = true;

  try {
    const token = await activeToken();

    await request("/rest/v1/projects", {
      method: "POST",
      token,
      body: {
        ...settings(),
        user_id: session.user.id,
      },
    });

    toast("Project settings saved. Video files are not saved.");
  } catch (error) {
    toast(error.message);
  } finally {
    $("#save").disabled = false;
  }
};

/* Saved projects */

$("#projectsNav").onclick = () => {
  show("projects");
  loadProjects();
};

async function loadProjects() {
  const list = $("#projectList");
  list.textContent = "Loading your projects…";

  try {
    const token = await activeToken();

    const rows = await request(
      "/rest/v1/projects" +
      "?select=id,title,clip_length,caption_style,created_at" +
      "&order=created_at.desc",
      { token }
    );

    list.replaceChildren();

    if (!rows?.length) {
      list.textContent =
        "No saved projects yet. Create a clip setup and choose Save project settings.";
      return;
    }

    for (const project of rows) {
      const row = document.createElement("article");
      row.className = "card project-row";

      const info = document.createElement("div");
      const title = document.createElement("strong");
      const meta = document.createElement("p");

      title.textContent = project.title;

      meta.textContent =
        project.clip_length +
        " · " +
        new Date(project.created_at).toLocaleDateString();

      info.append(title, meta);

      const actions = document.createElement("div");

      const open = document.createElement("button");
      open.textContent = "Open settings";
      open.className = "outline";

      open.onclick = () => {
        if (jobRunning) {
          toast("Wait for your current clips to finish first.");
          return;
        }

        clearWork();

        $("#name").value = project.title;
        $("#length").value = project.clip_length;
        $("#caption").value = project.caption_style;

        show("studio");

        toast(
          "Settings opened. Choose the original video again to preview it."
        );
      };

      const remove = document.createElement("button");
      remove.textContent = "Delete";

      remove.onclick = async () => {
        if (!confirm("Delete this saved project?")) return;

        remove.disabled = true;

        try {
          await request(
            "/rest/v1/projects?id=eq." +
            encodeURIComponent(project.id),
            {
              method: "DELETE",
              token: await activeToken(),
            }
          );

          await loadProjects();
        } catch (error) {
          toast(error.message);
          remove.disabled = false;
        }
      };

      actions.append(open, remove);
      row.append(info, actions);
      list.append(row);
    }
  } catch (error) {
    list.textContent = error.message;
  }
}

const homeSignIn = $("#homeSignIn");

if (homeSignIn) {
  homeSignIn.onclick = () => {
    if (session) {
      show("projects");
      loadProjects();
    } else {
      authOpen();
    }
  };
}

/* Backend response handling */

async function readBackendResponse(response) {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    let message = "Request failed. Please try again.";

    if (typeof data?.detail === "string") {
      message = data.detail;
    } else if (response.status === 413) {
      message =
        "The server rejected the upload size. Confirm the 200 MB server.py update is deployed.";
    } else if (response.status === 429) {
      message =
        "Clippa is busy or your upload limit has been reached. Try again later.";
    } else if (response.status === 502 ||
               response.status === 504) {
      message =
        "The hosting server timed out or restarted. Try a shorter video.";
    }

    throw new Error(message);
  }

  if (!data) {
    throw new Error(
      "The server returned an unexpected response. Check the Render deployment."
    );
  }

  return data;
}

/* Render finished clips */

function renderClips(clips) {
  $("#clipResults").replaceChildren();

  for (const [index, clip] of clips.entries()) {
    const card = document.createElement("article");
    card.className = "card";

    const title = document.createElement("h3");
    title.textContent = clip.title || "Highlight";

    const meta = document.createElement("p");
    meta.textContent =
      Number(clip.start).toFixed(1) +
      "s – " +
      Number(clip.end).toFixed(1) +
      "s";

    const player = document.createElement("video");
    player.controls = true;
    player.playsInline = true;
    player.preload = "metadata";
    player.src = clip.url;

    const download = document.createElement("a");
    download.className = "primary";
    download.href = clip.url;
    download.download = "clippa-clip-" + (index + 1) + ".mp4";
    download.textContent = "Download MP4";

    card.append(title, meta, player, download);
    $("#clipResults").append(card);
  }
}

/* Upload and generate clips */

$("#generate").onclick = async () => {
  if (jobRunning) return;

  const file = $("#file").files[0];

  if (!file) {
    toast("Choose your video file first.");
    return;
  }

  // FREE UPLOAD LIMIT: 200 MB
  if (file.size > MAX_UPLOAD_BYTES) {
    toast("Choose a video no larger than 200 MB.");
    return;
  }

  if (!$("#aiConsent").checked) {
    toast("Please confirm permission to send this video to Gemini.");
    return;
  }

  const lengthValues = {
    "15–30 seconds": 30,
    "30–60 seconds": 60,
    "60–90 seconds": 90,
  };

  const form = new FormData();
  form.append("video", file);
  form.append(
    "length",
    String(lengthValues[$("#length").value] || 60)
  );
  form.append("format", $("#format").value);

  jobRunning = true;

  $("#generate").disabled = true;
  $("#file").disabled = true;
  $("#clipResults").replaceChildren();

  $("#jobStatus").textContent =
    "Uploading your video… Keep this page open.";

  try {
    const response = await fetch("/api/clips", {
      method: "POST",
      body: form,
    });

    const data = await readBackendResponse(response);

    if (!data.job) {
      throw new Error("The server did not return a processing job.");
    }

    const deadline = Date.now() + PROCESSING_WAIT_MS;

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2500));

      const jobResponse = await fetch(
        "/api/jobs/" + encodeURIComponent(data.job),
        { cache: "no-store" }
      );

      const job = await readBackendResponse(jobResponse);

      $("#jobStatus").textContent =
        job.message || "Processing your video…";

      if (job.status === "error") {
        throw new Error(
          job.message || "Video processing failed."
        );
      }

      if (job.status === "ready") {
        if (!Array.isArray(job.clips) || !job.clips.length) {
          throw new Error("No clips were returned for this video.");
        }

        renderClips(job.clips);

        $("#jobStatus").textContent =
          "Ready! Download your clips now. Temporary exports expire in about an hour.";

        return;
      }
    }

    throw new Error(
      "Processing took too long. Please try a shorter video."
    );
  } catch (error) {
    $("#jobStatus").textContent =
      error.message || "Upload failed. Please try again.";
  } finally {
    jobRunning = false;
    $("#generate").disabled = false;
    $("#file").disabled = false;
  }
};

/* Initial state */

applySession();

/* Check server configuration */

fetch("/api/status", { cache: "no-store" })
  .then(readBackendResponse)
  .then((status) => {
    if (jobRunning) return;

    if (!status.configured) {
      $("#jobStatus").textContent =
        "Add GEMINI_API_KEY in Render to activate clipping.";
    } else if (Number(status.maxUploadMB) < 200) {
      $("#jobStatus").textContent =
        "The browser supports 200 MB, but the backend still needs the updated server.py.";
    }
  })
  .catch(() => {
    if (!jobRunning) {
      $("#jobStatus").textContent =
        "Clipping needs the backend. Check your Render Web Service deployment.";
    }
  });
