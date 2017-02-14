var gulp = require('gulp');
var tslint = require('gulp-tslint');
var shell = require('gulp-shell')

var serverFiles = {
    src: 'server/src/**/*.ts'
};

var clientFiles = {
    src: 'client/src/**/*.ts'
}

gulp.task('compileClient', shell.task([
    'cd client && npm install && tsc -p .'
]));

gulp.task('compileServer', shell.task([
    'cd server && npm install && tsc -p .'
]));

gulp.task('tslint', function () {
    return gulp.src([serverFiles.src, clientFiles.src])
        .pipe(tslint({
            formatter: "verbose"
        }))
        .pipe(tslint.report())
});

gulp.task('default', ['compileServer', 'compileClient', 'tslint']);
