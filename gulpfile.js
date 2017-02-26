var gulp = require('gulp');
var tslint = require('gulp-tslint');
var shell = require('gulp-shell')
var bump = require('gulp-bump')
var git = require('gulp-git');
var tag_version = require('gulp-tag-version');

var serverFiles = {
    src: 'server/src/**/*.ts'
};

var clientFiles = {
    src: 'client/src/**/*.ts'
}

function bumpVersion(ver) {
    return gulp.src(['client/package.json'])
        .pipe(bump({ type: ver }))
        .pipe(gulp.dest('client/'))
        .pipe(git.commit('Bump package version'))
        .pipe(tag_version());
}

gulp.task('compileClient', shell.task([
    'cd client && npm install && tsc -p .'
]));

gulp.task('compileServer', shell.task([
    'cd server && npm install && npm run compile'
]));

gulp.task('tslint', function () {
    return gulp.src([serverFiles.src, clientFiles.src])
        .pipe(tslint({
            formatter: "verbose"
        }))
        .pipe(tslint.report())
});

gulp.task('patch', ['default'], function () { return bumpVersion('patch'); })
gulp.task('minor', ['default'], function () { return bumpVersion('minor'); })
gulp.task('major', ['default'], function () { return bumpVersion('major'); })

gulp.task('default', ['compileServer', 'compileClient', 'tslint']);
