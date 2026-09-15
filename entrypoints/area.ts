import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { showAreaSelection } from '../src/platform/area-selection';

export default defineUnlistedScript(() => {
  showAreaSelection();
});
