var jsondiffpatch = require('jsondiffpatch').create();

// Initialise database collections for revisions

process.on("dbReady", function () {

  iris.modules.revisions.globals.collections = {};

  var collections = Object.keys(iris.entityTypes);

  collections.forEach(function (collection) {

    var fields = {
      "revisions": {
        "fieldType": "Revision"
      }
    };

    iris.dbSchemaRegister(collection + "_revisions", fields).then(function (pass) {



    }, function (fail) {


    });

  })

});


var saveRevision = function (current, previous) {

  return new Promise(function (resolve, reject) {

    if (current.entityType.indexOf("_revisions") != -1) {

      resolve();
      return false;

    }

    var diff = jsondiffpatch.diff(previous, current);

    iris.invokeHook("hook_entity_fetch", "root", null, {
      entities: [current.entityType + "_revisions"],
      queries: [{
        "field": "eid",
        "operator": "is",
        value: current.eid
      }]
    }).then(function (item) {

      if (!item || !item.length) {

        var diffEntry = {
          diff: JSON.stringify(diff),
          date: Date.now()
        }

        var revision = {
          entityType: current.entityType + "_revisions",
          eid: current.eid,
          revisions: [diffEntry]
        }

        iris.invokeHook("hook_entity_create", "root", null, revision).then(function (updated) {

          resolve();

        }, function (fail) {

          iris.log("error", fail);

        })

      } else {

        var diffEntry = {
          diff: JSON.stringify(diff),
          date: Date.now()
        }

        var revision = {
          entityType: current.entityType + "_revisions",
          eid: current.eid,
          revisions: [diffEntry].concat(item[0].revisions)
        }

        iris.invokeHook("hook_entity_edit", "root", null, revision).then(function (updated) {

          resolve();

        }, function (fail) {

          iris.log("error", fail);

        })

      }

    })

  })

}

iris.modules.revisions.registerHook("hook_entity_created", 0, function (thisHook, data) {

  saveRevision(data, data).then(function () {

    thisHook.pass(data);

  })

});

iris.modules.revisions.registerHook("hook_entity_updated", 0, function (thisHook, data) {

  var previous = thisHook.context.previous;
  var current = thisHook.context.new;

  saveRevision(current, previous).then(function () {

    thisHook.pass(data);

  })

});



iris.modules.revisions.globals.getRevision = function (entityType, eid, revisionID, authPass) {

  return new Promise(function (resolve, reject) {

    iris.invokeHook("hook_entity_fetch", "root", null, {
      entities: [entityType + "_revisions"],
      queries: [{
        "field": "eid",
        "operator": "is",
        value: eid
      }]
    }).then(function (item) {

      var revisions;

      if (item && item.length) {

        revisions = item[0].revisions.reverse();

        var query = {
          "entities": [entityType],
          "queries": [{
            "field": "eid",
            "operator": "is",
            "value": parseInt(eid)
          }]

        }

        iris.invokeHook("hook_entity_fetch", authPass, null, query).then(function (entity) {

          if (entity && entity[0]) {

            var current = entity[0];

          }

          if (current) {

            delete current["__v"];
            delete current["_id"];

            // Step through patches

            var i;

            if (revisionID > revisions.length) {

              reject("no such revision");
              return false;

            }


            var patched = current;
            var date;

            for (i = 0; i < revisions.length - revisionID; i += 1) {

              if (revisions[i].diff) {

                revisions[i].diff = JSON.parse(revisions[i].diff)

              } else {

                revisions[i].diff = undefined;

              }

              patched = jsondiffpatch.unpatch(patched, revisions[i].diff);
              date = revisions[i].date;

            }

            // Do permissions checks on entity

            iris.invokeHook("hook_entity_view", authPass, patched, patched).then(function (entity) {

              iris.invokeHook("hook_entity_view__" + entityType, authPass, entity, entity).then(function (validatedEntity) {

                if (validatedEntity) {

                  resolve({
                    entity: validatedEntity,
                    date: date,
                    total: revisions.length
                  })


                } else {

                  reject(403);

                }

              }, function (fail) {

                reject(403);

              });

            }, function (fail) {

              reject(403);

            })


          } else {

            reject(400)

          }

        }, function (fail) {

          reject(400);

        });

      } else {

        reject(404);

      }

    });


  })

};

// View entity at past state

iris.route.get("/revisions/:type/:eid/:back", function (req, res) {

  iris.modules.revisions.globals.getRevision(req.params.type, req.params.eid, req.params.back, req.authPass).then(function (revision) {

    var date;

    if (revision.date) {

      revision.date = new Date(revision.date);

      date = revision.date.getDate() + "/" + revision.date.getMonth() + "/" + revision.date.getFullYear() + " @ " + revision.date.getHours() + ":" + revision.date.getMinutes();

    }

    var message = "";

    if (parseInt(req.params.back) !== 0) {

      message += " <a title='go back' href=/revisions/" + req.params.type + "/" + req.params.eid + "/" + (parseInt(req.params.back) - 1) + ">&#10094;</a> ";

    } else {

      message += " ";

    }

    if (date) {

      message += "Viewing revision from " + date + ".";

    } else {

      message += "Viewing current revision."

    }

    if (req.params.back < revision.total) {

      message += " <a title='go forward' href=/revisions/" + req.params.type + "/" + req.params.eid + "/" + (parseInt(req.params.back) + 1) + ">&#10095;</a> ";

    } else {

      message += " ";

    }

    // Add revert button if not the current revision

    if (parseInt(req.params.back) !== parseInt(revision.total)) {

      message += " | <a href=/revisions/" + req.params.type + "/" + req.params.eid + "/" + req.params.back.toString() + "/revert" + ">Revert to this revision</a>";

    }

    iris.message(req.authPass.userid, message, "info");

    iris.modules.frontend.globals.parseTemplateFile([revision.entity.entityType, revision.entity.eid], ["html", revision.entity.entityType, revision.entity.eid], {
      current: revision.entity
    }, req.authPass, req).then(function (success) {

      res.send(success);

    }, function (fail) {

      iris.log("error", fail);

      res.status(500).send(fail);

    });

  }, function (fail) {

    if (!isNaN(fail)) {

      iris.invokeHook("hook_display_error_page", req.authPass, {
        error: fail,
        req: req
      }).then(function (success) {

        res.send(success);

      }, function (fail) {

        res.status(fail).send(fail);

      });

    } else {

      res.status(400).send(fail);

    }

  })

});

iris.modules.revisions.globals.revertRevision = function (entityType, eid, revisionID, authPass) {

  return new Promise(function (resolve, reject) {

    iris.modules.revisions.globals.getRevision(entityType, eid, revisionID, authPass).then(function (revision) {

      iris.invokeHook("hook_entity_edit", authPass, null, revision.entity).then(function (success) {

        resolve(success);

      }, function (fail) {

        reject(fail);

      })

    }, function (fail) {

      reject(fail);

    })

  })

};

iris.modules.revisions.registerHook("hook_form_render__revision_revert", 0, function (thisHook, data) {

  thisHook.context.params;

  data.schema.entityType = {
    type: "hidden",
    default: thisHook.context.params.entityType
  }

  data.schema.eid = {
    type: "hidden",
    default: thisHook.context.params.eid
  }

  data.schema.revision = {
    type: "hidden",
    default: thisHook.context.params.revision
  }

  thisHook.pass(data);

})

iris.modules.revisions.registerHook("hook_form_submit__revision_revert", 0, function (thisHook, data) {

  iris.modules.revisions.globals.revertRevision(thisHook.context.params.entityType, thisHook.context.params.eid, thisHook.context.params.revision, thisHook.authPass).then(function (success) {

    iris.message(thisHook.authPass.userid, "Revision reverted", "info");

    thisHook.pass(data);

  }, function (fail) {

    thisHook.fail(fail);

  });

});

iris.route.get("/revisions/:entityType/:eid/:revision/revert", function (req, res) {

  iris.modules.frontend.globals.parseTemplateFile(["revision_revert"], ['admin_wrapper'], {
    revision: req.params.revision,
    entityType: req.params.entityType,
    eid: req.params.eid
  }, req.authPass).then(function (html) {

    res.send(html);

  });

});

/**
 * @member hook_frontend_entity_links
 * @memberof revisions
 *
 * @desc add links to view entity revisions
 *
 */

iris.modules.revisions.registerHook("hook_entity_links", 0, function (thisHook, linkList) {

  linkList.push({
    link: "/revisions/" + thisHook.context.entity.entityType + "/" + thisHook.context.entity.eid + "/",
    title: "Revisions"
  })

  thisHook.pass(linkList);

});

iris.modules.auth.globals.registerPermission("can view entity revisions", "entity");

iris.route.get("/revisions/:entityType/:eid", {
  permissions: ["can view entity revisions"]
}, function (req, res) {

  // Find revisions

  iris.invokeHook("hook_entity_fetch", "root", null, {
    entities: [req.params.entityType + "_revisions"],
    queries: [{
      "field": "eid",
      "operator": "is",
      value: req.params.eid
      }]
  }).then(function (item) {

    var revisions;

    if (!item || !item[0]) {

      revisions = {
        revisions: null
      }

    } else {

      revisions = item[0].revisions

    }

    iris.modules.frontend.globals.parseTemplateFile(["entity_revisions"], ["admin_wrapper"], {
      revisions: revisions,
      entityType: req.params.entityType,
      eid: req.params.eid
    }, req.authPass, req).then(function (success) {

      res.send(success);

    }, function (fail) {

      iris.log("error", fail);

      res.status(500).send(fail);

    });


  });


});
