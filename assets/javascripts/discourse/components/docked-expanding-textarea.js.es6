import { on, observes } from 'ember-addons/ember-computed-decorators';
import autosize from 'discourse/lib/autosize';

export default Ember.TextArea.extend({
  attributeBindings: ['disabled'],
  
  @on('didInsertElement')
  _startWatching() {
    Ember.run.scheduleOnce('afterRender', () => {
      this.$().focus();
      autosize(this.element);
    });
  },

  @observes('value')
  _updateAutosize() {
    Ember.run.scheduleOnce('afterRender', () => {
      const evt = document.createEvent('Event');
      evt.initEvent('autosize:update', true, false);
      this.element.dispatchEvent(evt);
    })
  },

  @on('willDestroyElement')
  _disableAutosize() {
    autosize.destroy(this.$());
  }
});

// necessary because the expanding textarea in core is an admin component
