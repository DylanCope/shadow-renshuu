import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import type { Session } from '../types'

export interface StoredSession {
  id: string
  session_id: string
  userId: string
  title: string
  sentences: Session['sentences']
  audioUrl: string
  createdAt: Date
}

export async function saveSession(
  userId: string,
  session: Session,
  title?: string,
): Promise<string> {
  const docRef = await addDoc(collection(db, 'sessions'), {
    userId,
    session_id: session.session_id,
    title: title || session.sentences[0]?.text?.slice(0, 60) || 'Untitled session',
    sentences: session.sentences,
    audioUrl: session.audioUrl,
    createdAt: serverTimestamp(),
  })
  return docRef.id
}

export async function getUserSessions(userId: string): Promise<StoredSession[]> {
  const q = query(
    collection(db, 'sessions'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => {
    const data = d.data()
    // serverTimestamp() may still be null in the local cache for freshly written docs;
    // fall back to the current time so the date column is never blank.
    const ts = data.createdAt as Timestamp | null
    return {
      id: d.id,
      session_id: data.session_id,
      userId: data.userId,
      title: data.title,
      sentences: data.sentences,
      audioUrl: data.audioUrl,
      createdAt: ts != null ? ts.toDate() : new Date(),
    } as StoredSession
  })
}

export async function deleteSession(sessionDocId: string): Promise<void> {
  await deleteDoc(doc(db, 'sessions', sessionDocId))
}
