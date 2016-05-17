# irisjs-revisions

A revision system for the Iris content management system and framework (https://www.npmjs.com/package/irisjs)

## Installation 

* `npm install irisjs-revisions`
* Enable module through Iris administration system.

You'll need an `      {{{iris_messages}}}` block in your theme to skip through revisions. 

## Use

Every time an entity is updated a revision tracking what has changed is stored in a database for that entity type. If you go to the content listing in the administration screen you should get a `revisions` button. This will list the revisions for that entity and allow you to view them.

If you have an `{{{iris_messages}}}` block in your template you should be able to step backwards and forwards through revisions and revert to an older revision.
