import ApplicationRoute from 'discourse/routes/application';
import ApplicationController from 'discourse/controllers/application';
import TopicController from 'discourse/controllers/topic';
import Topic from 'discourse/models/topic';
import ComposerController from 'discourse/controllers/composer';
import ComposerView from 'discourse/views/composer';
import Composer from 'discourse/models/composer';
import UserMenu from 'discourse/components/user-menu';
import { default as computed, on, observes } from 'ember-addons/ember-computed-decorators';

export default {
  name: 'quick-messages-edits',
  initialize(){

    ApplicationRoute.reopen({
      actions: {

        dockedCompose: function(messages) {
          const composerController = this.controllerFor('composer')
          var opts = {
            action: Composer.PRIVATE_MESSAGE,
            usernames: "",
            archetypeId: 'private_message',
            draftKey: 'new_private_message',
            topic: null
          }
          composerController.prepareDockedCompose(true, messages)
          composerController.open(opts)
        },

        dockedReply: function(topic, messages) {
          const composerController = this.controllerFor('composer')
          var opts = {
            action: Composer.REPLY,
            draftKey: topic.draft_key,
            draftSequence: topic.draft_sequence,
            topic: topic
          }
          composerController.prepareDockedCompose(false, messages)
          composerController.open(opts)
        }

      }
    });

    ComposerController.reopen({
      docked: false,
      messages: null,
      existingDiscussion: null,
      skipStateChange: false,

      // these methods override existing composer controller methods

      actions: {
        save() {
          if (this.get('docked')) {this.dockedSave()} else {this.save()}
        },
        cancel() {
          if (this.get('docked')) {this.dockedCancel()} else {this.cancelComposer()}
        },
        toggle() {
          if (this.get('docked')) {this.dockedToggle()} else {this.toggle()}
        }
      },

      close() {
        if (!this.get('docked')) {
          this.setProperties({ model: null, lastValidatedAt: null })
        }
      },

      // end of methods that override existing composer controller methods

      prepareDockedCompose: function(reset, messages) {
        if (reset) {
          var model = this.get('model')
          if (model) {
            this.destroyDraft();
            model.clearState()
          }
          this.setProperties({ model: null, lastValidatedAt: null })
        }
        this.set('messages', messages)
        this.set('setDocked', true)
        Discourse.User.currentProp('disable_jump_reply', true)
      },

      setupDocked: function() {
        if (!this.get('model.draftKey') && this.get('docked')) {return}
        this.set('docked', this.get('setDocked'))
        this.set('setDocked', false)
      }.observes('model.draftKey'),

      dockedSave: function() {
        var model = this.get('model'),
            existingDiscussion = this.get('existingDiscussion');
        this.set('setDocked', true)
        this.set('skipStateChange', true)
        model.set('replyingToTopic', true)
        if (existingDiscussion) {
          model.setProperties({
            action: Composer.REPLY,
            draftKey: existingDiscussion.draft_key,
            draftSequence: existingDiscussion.draft_sequence,
            topic: existingDiscussion
          })
          this.set('existingDiscussion', null)
        }
        this.save(true)
      },

      dockedCancel: function() {
        this.setProperties({
          'model.composeState': Composer.CLOSED,
          'model.hasMetaData': null,
          'model.replyDirty': null
        })
        var self = this
        Ember.run.later((function() {
          self.setProperties({
            model: null,
            lastValidatedAt: null,
            docked: null
          })
        }), 1000)
        this.cancelComposer()
      },

      dockedToggle: function() {
        if (Ember.isEmpty(this.get('model.reply')) && Ember.isEmpty(this.get('model.title'))) {
          this.dockedCancel()
        } else {
          this.toggle()
        }
      },

      setSaveText: function() {
        var model = this.get('model'),
            docked = this.get('docked')
        if (!model || !docked) {return}
        model.set('saveText', '')
      }.observes('model.saveText', 'docked'),

      setVisiblility: function() {
        var model = this.get('model')
        if (!model) {return}
        var docked = this.get('docked')
        if (docked) {
          this.set('visible', true)
          if (!model.get('viewOpen')) {model.set('viewOpen', true)}
        } else {
          var state = model.get('composeState')
          this.set('visible', state && state !== 'closed');
          model.set('viewOpen', state === Composer.OPEN)
        }
      }.observes('model.composeState', 'model.viewOpen'),

      newDockedMessageUser: function() {
        if (!this.get('docked')) {return}
        var model = this.get('model')
        if (!model) {return}
        var topicId = model.get('createdPost.topic_id');
        if (!topicId) {return}
        this.newDockedMessage(topicId)
        this.set('setDocked', false)
      }.observes('model.createdPost'),

      newDockedMessageOther: function() {
        if (!this.get('docked')) {return}
        var model = this.get('model')
        if (!model) {return}
        var topicId = model.get('topic.id')
        this.newDockedMessage(topicId)
      }.observes('currentUser.unread_private_messages'),

      newDockedMessage: function(topicId) {
        Topic.find(topicId, {}).then((topic) => {
          var replyTo = Topic.create(topic)
          const appController = this.get('controllers.application')
          appController.send('dockedReply', replyTo)
          appController.toggleProperty('newPost')
          this.set('skipStateChange', false)
        })
      },

      createOrContinueDiscussion: function() {
        if (!this.get('docked')) {return}
        var model = this.get('model')
        if (!model) {return}
        this.set('existingDiscussion', null)
        var existingId = null,
            targetUsernames = model.get('targetUsernames');
        if (!targetUsernames) {return}
        Ember.run.once(this, function() {
          var messages = this.get('messages'),
              targetParticipants = targetUsernames.split(','),
              currentUser = this.get('currentUser.username');
          targetParticipants.push(currentUser)
          messages.forEach((message, i) => {
            var participants = []
            message.participants.forEach((participant, i) => {
              participants.push(participant.user.username)
            })
            if (participants.indexOf(currentUser) === -1) {
              participants.push(currentUser)
            }
            if ($(participants).not(targetParticipants).length === 0 &&
               $(targetParticipants).not(participants).length === 0) {
              existingId = message.id;
            }
          })
          if (existingId) {
            Topic.find(existingId, {}).then((topic) => {
              var existing = Topic.create(topic)
              this.set('existingDiscussion', existing)
            })
          } else {
            var title = '',
                length = targetParticipants.length;
            targetParticipants.forEach((participant, i) => {
              title += participant
              if (i < length) {
                title += i === (length - 1) ? ' & ' : ', '
              }
            })
            model.set('title', title)
          }
        })
      }.observes('model.targetUsernames')

    });

    ComposerView.reopen({

      @on('init')
      bindDocked() {
        var classes = this.get('classNameBindings')
        classes.push('controller.docked:docked')
        this.set('classNameBindings', classes)
      },

      // this property overrides the existing composerState property.

      @computed('composer.composeState', 'controller.skipStateChange')
      composeState(composeState) {
        if (this.get('controller.skipStateChange')) {
          return Composer.OPEN;
        } else {
          return composeState || Composer.CLOSED;
        }
      }

    });

    // This removes messages from the notifications stream in the user menu.

    UserMenu.reopen({

      setup: function() {
        this.addObserver('notifications', this.removeMessages)
      }.on('willInsertElement'),

      removeMessages: function() {
        var notifications = this.get('notifications')
        if (!notifications) {return}
        var notMessages = notifications.filter(function(n) {
          return n.notification_type !== 6;
        });
        this.removeObserver('notifications', this.removeMessages)
        this.set('notifications', notMessages)
        this.addObserver('notifications', this.removeMessages)
      }

    })

  }
}