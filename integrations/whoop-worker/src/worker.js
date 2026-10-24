import { DurableObject } from 'cloudflare:workers';
import worker from './index.js';
import { PersonalOsMirror as MirrorStorage } from './mirror-store.js';
export class PersonalOsMirror extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.mirror = new MirrorStorage(ctx, env); }
  fetch(request) { return this.mirror.fetch(request); }
}
export default worker;
