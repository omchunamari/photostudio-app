import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { db } from "./client";
import { notifyEmployee } from "./notifications";

/**
 * Post-production task doc shape (postProdTasks/{taskId}):
 * {
 *   title: string,
 *   description: string,
 *   taskType: string,          // one of TASK_TYPES
 *   projectId, projectName, clientName: string,   // denormalized
 *   eventId: string | null,    // optional link to a specific event within the project
 *   eventName: string | null,
 *   assignedUid: string,
 *   assignedName: string,
 *   status: string,            // one of TASK_STATUSES
 *   priority: string,          // one of TASK_PRIORITIES
 *   dueDate: string | null,    // ISO date
 *   deliverableLink: string,   // URL to the gallery/drive folder/final export, optional
 *   comments: [{ id, text, addedBy, addedByUid, addedAt }],
 *   createdBy, createdByUid, createdAt, updatedAt: string,
 * }
 */

export const TASK_TYPES = [
  "Photo Culling & Selection",
  "Photo Editing",
  "Color Grading",
  "Video Editing",
  "Highlight Reel",
  "Album Design",
  "Raw Data Backup",
  "Client Revision",
  "Other",
];

// Ordered pipeline — index also drives the board column order.
export const TASK_STATUSES = ["Not Started", "In Progress", "In Review", "Revision Needed", "Completed"];

export const TASK_PRIORITIES = ["Low", "Medium", "High", "Urgent"];

function makeId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isOverdue(task) {
  if (!task.dueDate || task.status === "Completed") return false;
  return task.dueDate < new Date().toISOString().split("T")[0];
}

export async function createTask(data, createdByUid, createdByName) {
  const now = new Date().toISOString();
  // assignedUids/assignedNames carry every assignee (a task can go to more
  // than one employee); assignedUid/assignedName mirror the first one for
  // backward compatibility with older docs, single-assignee UI bits, and
  // the Firestore rule that checks resource.data.assignedUid.
  const assignedUids = data.assignedUids?.length ? data.assignedUids : [data.assignedUid].filter(Boolean);
  const assignedNames = data.assignedNames?.length ? data.assignedNames : [data.assignedName].filter(Boolean);
  const ref = await addDoc(collection(db, "postProdTasks"), {
    title: data.title,
    description: data.description || "",
    taskType: data.taskType,
    projectId: data.projectId || null,
    projectName: data.projectName || "",
    clientName: data.clientName || "",
    eventId: data.eventId || null,
    eventName: data.eventName || null,
    assignedUid: assignedUids[0] || "",
    assignedName: assignedNames[0] || "",
    assignedUids,
    assignedNames,
    status: "Not Started",
    priority: data.priority || "Medium",
    dueDate: data.dueDate || null,
    deliverableLink: data.deliverableLink || "",
    comments: [],
    createdBy: createdByName,
    createdByUid,
    createdAt: now,
    updatedAt: now,
  });

  await Promise.all(
    assignedUids.map((uid) =>
      notifyEmployee(uid, {
        type: "post_prod_assignment",
        title: "New post-production task",
        message: `${createdByName} assigned you "${data.title}"${data.projectName ? ` for ${data.projectName}` : ""}.`,
        projectId: data.projectId || null,
        eventId: data.eventId || null,
      })
    )
  );

  return ref.id;
}

export async function getAllTasks() {
  const q = query(collection(db, "postProdTasks"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getTasksForEmployee(uid) {
  // Two queries merged client-side: assignedUids array-contains covers
  // multi-assignee tasks, and assignedUid == uid covers older docs created
  // before assignedUids existed (they never got that field backfilled).
  const [byArray, byLegacy] = await Promise.all([
    getDocs(query(collection(db, "postProdTasks"), where("assignedUids", "array-contains", uid))),
    getDocs(query(collection(db, "postProdTasks"), where("assignedUid", "==", uid))),
  ]);
  const byId = new Map();
  byArray.docs.forEach((d) => byId.set(d.id, { id: d.id, ...d.data() }));
  byLegacy.docs.forEach((d) => byId.set(d.id, { id: d.id, ...d.data() }));
  return [...byId.values()].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export async function getTasksForProject(projectId) {
  const q = query(collection(db, "postProdTasks"), where("projectId", "==", projectId));
  const snap = await getDocs(q);
  const results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return results.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export async function updateTask(taskId, data) {
  await updateDoc(doc(db, "postProdTasks", taskId), {
    ...data,
    updatedAt: new Date().toISOString(),
  });
}

export async function updateTaskStatus(taskId, status, task) {
  await updateDoc(doc(db, "postProdTasks", taskId), {
    status,
    updatedAt: new Date().toISOString(),
  });

  // Let the person who created the task know once it's ready for their eyes.
  if ((status === "In Review" || status === "Completed") && task?.createdByUid) {
    await notifyEmployee(task.createdByUid, {
      type: "post_prod_status",
      title: status === "Completed" ? "Task completed" : "Task ready for review",
      message: `"${task.title}" was marked ${status.toLowerCase()} by ${task.assignedName}.`,
      projectId: task.projectId || null,
      eventId: task.eventId || null,
    });
  }
}

export async function reassignTask(taskId, newUid, newName, reassignedByName) {
  const snap = await getDoc(doc(db, "postProdTasks", taskId));
  const task = snap.exists() ? snap.data() : null;

  await updateDoc(doc(db, "postProdTasks", taskId), {
    assignedUid: newUid,
    assignedName: newName,
    assignedUids: [newUid],
    assignedNames: [newName],
    updatedAt: new Date().toISOString(),
  });

  await notifyEmployee(newUid, {
    type: "post_prod_assignment",
    title: "New post-production task",
    message: `${reassignedByName} assigned you "${task?.title || "a task"}"${task?.projectName ? ` for ${task.projectName}` : ""}.`,
    projectId: task?.projectId || null,
    eventId: task?.eventId || null,
  });
}

export async function addTaskComment(taskId, text, addedByUid, addedByName) {
  const ref = doc(db, "postProdTasks", taskId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const comments = snap.data().comments || [];
  await updateDoc(ref, {
    comments: [
      ...comments,
      { id: makeId(), text, addedBy: addedByName, addedByUid, addedAt: new Date().toISOString() },
    ],
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteTask(taskId) {
  await deleteDoc(doc(db, "postProdTasks", taskId));
}

export { isOverdue };