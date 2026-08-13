import admin from './admin';
import contentApi from './content-api';

export default {
  admin,
  // Mounted unconditionally at /api/rest-cache/*. The enableContentApiPurge
  // gate is enforced in the controller, which responds 404 when the option is
  // off - not here. An earlier version of this comment claimed register.js
  // skipped the group entirely; it never did, and describing a layer of defence
  // that does not exist is worse than describing none.
  'content-api': contentApi,
};
