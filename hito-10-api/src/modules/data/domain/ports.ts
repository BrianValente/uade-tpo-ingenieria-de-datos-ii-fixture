import type { OperationContext, User } from '../../auth/domain/ports.js'

export type Team = {
  id: string
  code: string
  name: string
  confederation: string
  selectionOrigin: string
  qualificationStage: string
  participates: boolean
  trainingBase?: string
}
export type Player = {
  id: string
  teamId: string
  teamCode: string
  firstName: string
  lastName: string
  birthDate: string
  position: string
  number: number
  heightCm: number
  preferredFoot: string
  selected: boolean
  available: boolean
  synthetic: boolean
}
export type MatchGraph = {
  id: string
  date: string
  time: string
  phase: string
  homeCode: string
  awayCode: string
  venue: {
    id: string
    name: string
    city: string
    country: string
    region: string
  }
}
export type GraphEvent = {
  id: string
  type: string
  minute: number
  detail: string
  player: { id: string; firstName: string; lastName: string; teamCode: string }
}
export type Comment = {
  matchId: string
  createdAt: string
  id: string
  userId: string
  username: string
  content: string
  state: string
  likes: number
  replies: number
}
export type CommentCursor = { createdAt: string; id: string }
export type IrisMatch = {
  code: string
  dateTime: string
  homeCode: string
  awayCode: string
  state: string
  referee: {
    code: string
    name: string
    nationality: string
    license: string
    category: string
  }
  homeCoach: {
    code: string
    name: string
    nationality: string
    license: string
    teamCode: string
  }
  awayCoach: {
    code: string
    name: string
    nationality: string
    license: string
    teamCode: string
  }
  events: { code: string; type: string; minute: number; detail: string }[]
}

export interface DocumentRepository {
  findTeam(code: string, context: OperationContext): Promise<Team | null>
  listPlayers(
    teamId: string,
    page: number,
    limit: number,
    context: OperationContext,
  ): Promise<{ items: Player[]; total: number }>
  close(): Promise<void>
}
export interface GraphRepository {
  findMatch(id: string, context: OperationContext): Promise<MatchGraph | null>
  listEvents(
    id: string,
    limit: number,
    context: OperationContext,
  ): Promise<GraphEvent[] | null>
  close(): Promise<void>
}
export interface CommentRepository {
  list(
    matchId: string,
    minute: Date,
    limit: number,
    cursor: CommentCursor | undefined,
    context: OperationContext,
  ): Promise<Comment[]>
  create(input: Comment, context: OperationContext): Promise<void>
  close(): Promise<void>
}
export interface StatisticsRepository {
  summary(
    matchId: string,
    start: string,
    end: string,
    context: OperationContext,
  ): Promise<Record<string, unknown>[]>
}
export interface ObjectRepository {
  find(code: string, context: OperationContext): Promise<IrisMatch | null>
  changeState(
    code: string,
    state: string,
    context: OperationContext,
  ): Promise<IrisMatch | null>
  addEvent(
    code: string,
    event: { code: string; type: string; minute: number; detail: string },
    context: OperationContext,
  ): Promise<IrisMatch | null>
}

export type AuthorizedUser = User
