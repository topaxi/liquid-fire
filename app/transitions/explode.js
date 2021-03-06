import Ember from "ember";
import { Promise } from "liquid-fire";

// Explode is not, by itself, an animation. It exists to pull apart
// other elements so that each of the pieces can be targeted by
// animations.

export default function explode(...pieces) {
  var seenElements = {};
  var sawBackgroundPiece = false;
  var promises = pieces.map((piece) => {
    if (piece.matchBy) {
      return matchAndExplode(this, piece, seenElements);
    } else if (piece.pick || piece.pickOld || piece.pickNew){
      return explodePiece(this, piece, seenElements);
    } else {
      sawBackgroundPiece = true;
      return runAnimation(this, piece);
    }
  });
  if (!sawBackgroundPiece) {
    if (this.newElement) {
      this.newElement.css({visibility: ''});
    }
    if (this.oldElement) {
      this.oldElement.css({visibility: 'hidden'});
    }
  }
  return Promise.all(promises);
}

function explodePiece(context, piece, seen) {
  var childContext = Ember.copy(context);
  var selectors = [piece.pickOld || piece.pick, piece.pickNew || piece.pick];
  var cleanupOld, cleanupNew;

  if (selectors[0] || selectors[1]) {
    cleanupOld = _explodePart(context, 'oldElement', childContext, selectors[0], seen);
    cleanupNew = _explodePart(context, 'newElement', childContext, selectors[1], seen);
    if (!cleanupOld && !cleanupNew) {
      return Promise.resolve();
    }
  }

  return runAnimation(childContext, piece).finally(() => {
    if (cleanupOld) { cleanupOld(); }
    if (cleanupNew) { cleanupNew(); }
  });
}

function _explodePart(context, field, childContext, selector, seen) {
  var child, childOffset, width, height, newChild;
  var elt = context[field];

  childContext[field] = null;
  if (elt && selector) {
    child = elt.find(selector).filter(function() {
      var guid = Ember.guidFor(this);
      if (!seen[guid]) {
        seen[guid] = true;
        return true;
      }
    });
    if (child.length > 0) {
      childOffset = child.offset();
      width = child.outerWidth();
      height = child.outerHeight();
      newChild = child.clone();

      // Hide the original element
      child.css({visibility: 'hidden'});

      // If the original element's parent was hidden, hide our clone
      // too.
      if (elt.css('visibility') === 'hidden') {
        newChild.css({ visibility: 'hidden' });
      }
      newChild.appendTo(elt.parent());
      newChild.outerWidth(width);
      newChild.outerHeight(height);
      var newParentOffset = newChild.offsetParent().offset();
      newChild.css({
        position: 'absolute',
        top: childOffset.top - newParentOffset.top,
        left: childOffset.left - newParentOffset.left,
        margin: 0
      });

      // Pass the clone to the next animation
      childContext[field] = newChild;
      return function cleanup() {
        newChild.remove();
        child.css({visibility: ''});
      };
    }
  }
}

function animationFor(context, piece) {
  var name, args, func;
  if (!piece.use) {
    throw new Error("every argument to the 'explode' animation must include a followup animation to 'use'");
  }
  if (Ember.isArray(piece.use) ) {
    name = piece.use[0];
    args = piece.use.slice(1);
  } else {
    name = piece.use;
    args = [];
  }
  if (typeof name === 'function') {
    func = name;
  } else {
    func = context.lookup(name);
  }
  return function() {
    return Promise.resolve(func.apply(this, args));
  };
}

function runAnimation(context, piece) {
  return new Promise((resolve, reject) => {
    animationFor(context, piece).apply(context).then(resolve, reject);
  });
}

function matchAndExplode(context, piece, seen) {
  if (!context.oldElement || !context.newElement) {
    return Promise.resolve();
  }

  var oldPrefix = piece.pickOld || piece.pick || '';
  var newPrefix = piece.pickNew || piece.pick || '';

  var hits = Ember.A(context.oldElement.find(`${oldPrefix}[${piece.matchBy}]`).toArray());
  return Promise.all(hits.map((elt) => {
    var propValue = Ember.$(elt).attr(piece.matchBy);
    var selector = `[${piece.matchBy}=${propValue}]`;
    if (context.newElement.find(`${newPrefix}${selector}`).length > 0) {
      return explodePiece(context, {
        pickOld: `${oldPrefix}[${piece.matchBy}=${propValue}]`,
        pickNew: `${newPrefix}[${piece.matchBy}=${propValue}]`,
        use: piece.use
      }, seen);
    } else {
      return Promise.resolve();
    }
  }));
}
