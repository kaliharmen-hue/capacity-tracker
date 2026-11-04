import { DurableObject } from 'cloudflare:workers';
import worker from './index.js';
import { PersonalOsMirror as MirrorStorage } from './mirror-store.js';
import { PhotoLibraryStorage } from './photos.js';
export class PhotoLibrary extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.library = new PhotoLibraryStorage(ctx, env); }
  fetch(request) { return this.library.fetch(request); }
}
export class PersonalOsMirror extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.mirror = new MirrorStorage(ctx, env); }
  fetch(request) { return this.mirror.fetch(request); }
}
export default worker;
