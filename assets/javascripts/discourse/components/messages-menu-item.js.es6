export default Ember.Component.extend({
  tagName: "li",

  markRead: function(){
    this.$('a').click(() => {
      this.set('message.read', true);
      return true;
    });
  }.on('didInsertElement')

})